import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { signalingStore } from "@/lib/signalingStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const myUsername = searchParams.get("myUsername")?.toLowerCase().trim();
  const partnerUsername = searchParams.get("partnerUsername")?.toLowerCase().trim();

  if (!myUsername || !partnerUsername) {
    return NextResponse.json({ messages: [] });
  }

  const dbRes = await connectToDatabase();
  if (dbRes.isConnected) {
    try {
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
            reactions: m.reactions,
            createdAt: m.createdAt,
          })),
        });
      }
    } catch (err: any) {
      console.error("Messages GET DB error:", err.message);
    }
  }

  // Fallback to in-memory store
  const messages = signalingStore.getMessagesBetween(myUsername, partnerUsername);
  return NextResponse.json({
    messages:
      messages.length > 0
        ? messages
        : [
            {
              id: "welcome_msg",
              senderUsername: partnerUsername,
              senderName: partnerUsername,
              receiverUsername: myUsername,
              type: "text",
              content: `Hey! ✨ We can now chat, send voice notes, love pings, and start HD video calls! 💖`,
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
      return NextResponse.json({ error: "Sender, receiver and content are required" }, { status: 400 });
    }

    const sUname = senderUsername.toLowerCase().trim();
    const rUname = receiverUsername.toLowerCase().trim();

    const newMessage = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      senderId: `usr_${sUname}`,
      senderUsername: sUname,
      senderName: senderName || sUname,
      senderAvatar: senderAvatar || "",
      receiverUsername: rUname,
      type: type || "text",
      content,
      audioDuration: audioDuration || 0,
      reactions: [],
      createdAt: new Date().toISOString(),
    };

    // Add to memory
    signalingStore.addMessage(newMessage as any);

    // Save to MongoDB if connected
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      try {
        await Message.create({
          senderId: sUname,
          senderUsername: sUname,
          senderName: senderName || sUname,
          senderAvatar: senderAvatar || "",
          receiverUsername: rUname,
          receiverId: rUname,
          type: type || "text",
          content,
          audioDuration,
          reactions: [],
        });
      } catch (err: any) {
        console.error("Save message DB error:", err.message);
      }
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
      return NextResponse.json({ error: "MessageId, user, and emoji required" }, { status: 400 });
    }

    signalingStore.addReaction(messageId, user, emoji);
    return NextResponse.json({ success: true, messageId, emoji });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
