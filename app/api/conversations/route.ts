import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { User } from "@/lib/models/User";
import { signalingStore } from "@/lib/signalingStore";
import { getPingOptionFromContent } from "@/lib/lovePings";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const memoryConversations = signalingStore.getConversationsForUser(username);
  const conversationsMap = new Map<string, any>();

  // Seed with in-memory conversations first
  for (const c of memoryConversations) {
    conversationsMap.set(c.username, c);
  }

  // Fetch from MongoDB
  const dbRes = await connectToDatabase();
  if (dbRes.isConnected) {
    try {
      // 1. Fetch distinct partners from messages
      const dbMessages = await Message.find({
        $or: [{ senderUsername: username }, { receiverUsername: username }],
      }).sort({ createdAt: -1 }).limit(300);

      for (const m of dbMessages) {
        const s = m.senderUsername.toLowerCase();
        const r = m.receiverUsername.toLowerCase();
        const partnerUname = s === username ? r : s;

        if (partnerUname && !conversationsMap.has(partnerUname)) {
          let preview = m.content;
          if (m.type === "love_ping") {
            const ping = getPingOptionFromContent(m.content);
            preview = `${ping.icon} Sent a ${ping.title} Ping!`;
          }
          else if (m.type === "image") preview = "📷 Photo";
          else if (m.type === "voice") preview = `🎤 Voice note (${m.audioDuration || 3}s)`;
          else if (m.type === "sticker") preview = "✨ Sticker";

          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: m.senderName || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: m.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: preview,
            lastMessageType: m.type,
            lastMessageTime: m.createdAt,
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // 2. Fetch accepted friend requests
      const dbAccepted = await FriendRequest.find({
        $or: [{ receiverUsername: username }, { senderUsername: username }],
        status: "accepted",
      });

      for (const req of dbAccepted) {
        const s = req.senderUsername.toLowerCase();
        const r = req.receiverUsername.toLowerCase();
        const partnerUname = s === username ? r : s;

        if (partnerUname && !conversationsMap.has(partnerUname)) {
          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: req.senderName || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: req.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: "Connected! Click to chat ✨",
            lastMessageType: "text",
            lastMessageTime: req.createdAt,
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // Enrich avatars & names from User records if available
      const partnerUsernames = Array.from(conversationsMap.keys());
      if (partnerUsernames.length > 0) {
        const users = await User.find({ username: { $in: partnerUsernames } });
        for (const u of users) {
          const existing = conversationsMap.get(u.username);
          if (existing) {
            existing.name = u.name || existing.name;
            if (u.avatar) existing.avatar = u.avatar;
            existing.status = u.status || "online";
          }
        }
      }
    } catch (err: any) {
      console.error("Conversations GET DB error:", err.message);
    }
  }

  // Also include discovery default users if no friends yet so the user always has people to talk to
  const list = Array.from(conversationsMap.values());
  return NextResponse.json({ conversations: list });
}
