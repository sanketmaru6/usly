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

  // 1. Seed with in-memory conversations first
  for (const c of memoryConversations) {
    conversationsMap.set(c.username.toLowerCase(), c);
  }

  // 2. Fetch from MongoDB
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
        const s = m.senderUsername.toLowerCase();
        const r = (m.receiverUsername || m.receiverId || "").toLowerCase();
        const partnerUname = s === username ? r : s;

        if (partnerUname && !conversationsMap.has(partnerUname)) {
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
        const s = reqItem.senderUsername.toLowerCase();
        const r = reqItem.receiverUsername.toLowerCase();
        const partnerUname = s === username ? r : s;

        if (partnerUname && !conversationsMap.has(partnerUname)) {
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

  // 3. If zero conversations, add starter contacts so the UI is immediately alive
  if (conversationsMap.size === 0) {
    const starterFriends = [
      {
        username: "sweetheart",
        name: "Sweetheart",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sweetheart",
        lastMessage: "Missing you ❤️ Click here to chat!",
        lastMessageType: "text",
        lastMessageTime: new Date().toISOString(),
        unreadCount: 1,
        status: "online",
      },
      {
        username: "alexa",
        name: "Alexa Love",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alexa",
        lastMessage: "Ready for our video call? 📹✨",
        lastMessageType: "text",
        lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
        unreadCount: 0,
        status: "online",
      },
    ];
    for (const sf of starterFriends) {
      if (sf.username !== username) {
        conversationsMap.set(sf.username, sf);
      }
    }
  }

  return NextResponse.json({ conversations: Array.from(conversationsMap.values()) });
}
