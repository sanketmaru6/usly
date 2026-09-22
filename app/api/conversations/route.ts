import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { User } from "@/lib/models/User";
import { signalingStore } from "@/lib/signalingStore";
import { getPingOptionFromContent } from "@/lib/lovePings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const memoryConversations = signalingStore.getConversationsForUser(username);
  const conversationsMap = new Map<string, any>();

  // 1. In-memory conversations (from actual session activity)
  for (const c of memoryConversations) {
    if (c.username && c.username !== username) {
      conversationsMap.set(c.username.toLowerCase(), c);
    }
  }

  // 2. Fetch real conversations from MongoDB
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      // Fetch distinct partners from messages
      const dbMessages = await Message.find({
        $or: [{ senderUsername: username }, { receiverUsername: username }],
      })
        .sort({ createdAt: -1 })
        .limit(300);

      for (const m of dbMessages) {
        const s: string = (m.senderUsername || "").toLowerCase();
        const r: string = (m.receiverUsername || m.receiverId || "").toLowerCase();
        const partnerUname: string = s === username ? r : s;

        if (partnerUname && partnerUname !== username && !conversationsMap.has(partnerUname)) {
          let preview = m.content;
          if (m.type === "love_ping") {
            const ping = getPingOptionFromContent(m.content);
            preview = `${ping.icon} Sent a ${ping.title} Ping!`;
          } else if (m.type === "image") {
            preview = "📷 Photo";
          } else if (m.type === "voice") {
            preview = `🎤 Voice note (${m.audioDuration || 3}s)`;
          } else if (m.type === "sticker") {
            preview = "✨ Sticker";
          }

          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: m.senderName || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: m.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: preview,
            lastMessageType: m.type || "text",
            lastMessageTime: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // Fetch accepted friend requests
      const dbAccepted = await FriendRequest.find({
        $or: [{ receiverUsername: username }, { senderUsername: username }],
        status: "accepted",
      });

      for (const reqItem of dbAccepted) {
        const s: string = (reqItem.senderUsername || "").toLowerCase();
        const r: string = (reqItem.receiverUsername || "").toLowerCase();
        const partnerUname: string = s === username ? r : s;

        if (partnerUname && partnerUname !== username && !conversationsMap.has(partnerUname)) {
          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: reqItem.senderName || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: reqItem.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: "Connected! Click to chat ✨",
            lastMessageType: "text",
            lastMessageTime: reqItem.createdAt ? new Date(reqItem.createdAt).toISOString() : new Date().toISOString(),
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // Enrich avatars & names from User records
      const partnerUsernames = Array.from(conversationsMap.keys());
      if (partnerUsernames.length > 0) {
        const users = await User.find({ username: { $in: partnerUsernames } });
        for (const u of users) {
          const existing = conversationsMap.get(u.username.toLowerCase());
          if (existing) {
            existing.name = u.name || existing.name;
            if (u.avatar) existing.avatar = u.avatar;
            existing.status = u.status || "online";
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Conversations GET DB error:", err.message);
  }

  return NextResponse.json({ conversations: Array.from(conversationsMap.values()) });
}
