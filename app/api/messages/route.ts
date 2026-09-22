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

  // 1. Try fetching from MongoDB first
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const messages = await Message.find({
        $or: [
          { senderUsername: myUsername, receiverUsername: partnerUsername },
          { senderUsername: partnerUsername, receiverUsername: myUsername },
          { senderUsername: myUsername, receiverId: partnerUsername },
          { senderUsername: partnerUsername, receiverId: myUsername },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(200);

      if (messages && messages.length > 0) {
        return NextResponse.json({
          messages: messages.map((m) => ({
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
          })),
        });
      }
    }
  } catch (err: any) {
    console.error("Messages GET DB error:", err.message);
  }

  // 2. Fallback to in-memory store
  const memMessages = signalingStore.getMessagesBetween(myUsername, partnerUsername);
  if (memMessages && memMessages.length > 0) {
    return NextResponse.json({ messages: memMessages });
  }

  // 3. Return a starter friendly greeting if there are zero messages yet
  return NextResponse.json({
    messages: [
      {
        id: `welcome_${partnerUsername}_${myUsername}`,
        senderUsername: partnerUsername,
        senderName: partnerUsername.charAt(0).toUpperCase() + partnerUsername.slice(1),
        senderAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUsername}`,
        receiverUsername: myUsername,
        type: "text",
        content: `Hey! ✨ We're connected. We can now chat, send voice notes, love pings, and start HD video calls! 💖`,
        reactions: [{ user: myUsername, emoji: "💖" }],
        createdAt: new Date().toISOString(),
      },
    ],
  });
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

    const newMessage = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
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

    // Store in-memory
    signalingStore.addMessage(newMessage as any);

    // Persist in MongoDB
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
          newMessage.id = saved._id.toString();
        }
      }
    } catch (err: any) {
      console.error("Save message DB error:", err.message);
    }

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

    signalingStore.addReaction(messageId, user, emoji);

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
