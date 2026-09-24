import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const myUsername = searchParams.get("myUsername")?.toLowerCase().trim();
  const partnerUsername = searchParams.get("partnerUsername")?.toLowerCase().trim();

  if (!myUsername || !partnerUsername) {
    return NextResponse.json({ messages: [] });
  }

  // ── PRIMARY SOURCE: MongoDB (works on ALL devices, all sessions) ──
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const messages = await Message.find({
        $or: [
          { senderUsername: myUsername, receiverUsername: partnerUsername },
          { senderUsername: partnerUsername, receiverUsername: myUsername },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(500)
        .lean();

      if (messages && messages.length > 0) {
        const dbMessages = messages.map((m: any) => ({
          id: m._id.toString(),
          senderUsername: m.senderUsername,
          senderName: m.senderName || m.senderUsername,
          senderAvatar: m.senderAvatar,
          receiverUsername: m.receiverUsername || m.receiverId,
          type: m.type,
          content: m.content,
          audioDuration: m.audioDuration,
          reactions: m.reactions || [],
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        }));

        // Also merge in-memory for messages sent < 10 seconds ago (not yet in DB index)
        const tenSecondsAgo = Date.now() - 10_000;
        const memMessages = signalingStore.getMessagesBetween(myUsername, partnerUsername) || [];
        const dbIds = new Set(dbMessages.map((m) => m.id));

        for (const m of memMessages) {
          if (!m || !m.id) continue;
          if (dbIds.has(m.id)) continue;
          // Only include very recent in-memory messages not yet persisted
          const msgTime = m.createdAt ? new Date(m.createdAt).getTime() : 0;
          if (msgTime >= tenSecondsAgo) {
            dbMessages.push(m as any);
          }
        }

        dbMessages.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return NextResponse.json({ messages: dbMessages });
      }
    }
  } catch (err: any) {
    console.error("Messages GET DB error:", err.message);
  }

  // ── FALLBACK: In-memory only (DB unreachable) ──
  const memMessages = signalingStore.getMessagesBetween(myUsername, partnerUsername) || [];
  return NextResponse.json({ messages: memMessages });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      senderUsername,
      senderName,
      senderAvatar,
      receiverUsername,
      type,
      content,
      audioDuration,
    } = body;

    if (!senderUsername || !receiverUsername || !content) {
      return NextResponse.json(
        { error: "Sender, receiver and content are required" },
        { status: 400 }
      );
    }

    const sUname = senderUsername.toLowerCase().trim();
    const rUname = receiverUsername.toLowerCase().trim();

    // ── STEP 1: Save to MongoDB FIRST (source of truth) ──
    let dbId: string | null = null;
    try {
      const dbRes = await connectToDatabase();
      if (dbRes.isConnected) {
        const saved = await Message.create({
          senderId: sUname,
          senderUsername: sUname,
          senderName: senderName || sUname,
          senderAvatar: senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sUname}`,
          receiverUsername: rUname,
          receiverId: rUname,
          type: type || "text",
          content,
          audioDuration: audioDuration || 0,
          reactions: [],
        });
        if (saved) {
          dbId = saved._id.toString();
        }
      }
    } catch (err: any) {
      console.error("Save message DB error:", err.message);
    }

    const newMessage = {
      id: dbId || "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      senderId: `usr_${sUname}`,
      senderUsername: sUname,
      senderName: senderName || sUname,
      senderAvatar: senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sUname}`,
      receiverUsername: rUname,
      type: type || "text",
      content,
      audioDuration: audioDuration || 0,
      reactions: [],
      createdAt: new Date().toISOString(),
    };

    // ── STEP 2: Store in-memory for real-time SSE broadcast ──
    signalingStore.addMessage(newMessage as any);

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, user, emoji } = body;

    if (!messageId || !user || !emoji) {
      return NextResponse.json(
        { error: "MessageId, user, and emoji required" },
        { status: 400 }
      );
    }

    // Update in-memory for instant SSE reflection
    signalingStore.addReaction(messageId, user, emoji);

    // Persist to MongoDB
    try {
      const dbRes = await connectToDatabase();
      if (dbRes.isConnected && messageId.length === 24) {
        const msg = await Message.findById(messageId);
        if (msg) {
          const idx = msg.reactions.findIndex((r) => r.user === user);
          if (idx > -1) {
            if (msg.reactions[idx].emoji === emoji) {
              msg.reactions.splice(idx, 1);
            } else {
              msg.reactions[idx].emoji = emoji;
            }
          } else {
            msg.reactions.push({ user, emoji });
          }
          await msg.save();
        }
      }
    } catch (e: any) {
      console.error("Reaction DB error:", e.message);
    }

    return NextResponse.json({ success: true, messageId, emoji });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
