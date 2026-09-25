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
  const allMessagesMap = new Map<string, any>();

  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const myRegex = new RegExp(`^${myUsername}$`, "i");
      const partnerRegex = new RegExp(`^${partnerUsername}$`, "i");

      const messages = await Message.find({
        $or: [
          { senderUsername: myRegex, receiverUsername: partnerRegex },
          { senderUsername: partnerRegex, receiverUsername: myRegex },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(1000)
        .lean();

      if (messages && messages.length > 0) {
        for (const m of messages) {
          const item = {
            id: m._id.toString(),
            senderUsername: (m.senderUsername || "").toLowerCase(),
            senderName: m.senderName || m.senderUsername,
            senderAvatar: m.senderAvatar,
            receiverUsername: (m.receiverUsername || (m as any).receiverId || "").toLowerCase(),
            type: m.type,
            content: m.content,
            audioDuration: m.audioDuration,
            reactions: m.reactions || [],
            createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
          };
          allMessagesMap.set(item.id, item);
        }
      }
    }
  } catch (err: any) {
    console.error("Messages GET DB error:", err.message);
  }

  // ── SECONDARY: In-memory live messages (reconciles instant in-flight / recent messages) ──
  const memMessages = signalingStore.getMessagesBetween(myUsername, partnerUsername) || [];
  for (const m of memMessages) {
    if (m && m.id && !allMessagesMap.has(m.id)) {
      allMessagesMap.set(m.id, {
        id: m.id,
        senderUsername: (m.senderUsername || "").toLowerCase(),
        senderName: m.senderName || m.senderUsername,
        senderAvatar: (m as any).senderAvatar,
        receiverUsername: (m.receiverUsername || "").toLowerCase(),
        type: m.type,
        content: m.content,
        audioDuration: m.audioDuration,
        reactions: m.reactions || [],
        createdAt: m.createdAt || new Date().toISOString(),
      });
    }
  }

  const sortedList = Array.from(allMessagesMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return NextResponse.json({ messages: sortedList });
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
