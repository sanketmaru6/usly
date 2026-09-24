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

  const conversationsMap = new Map<string, any>();

  // ── PRIMARY SOURCE: MongoDB (works on ALL devices) ──
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      // Fetch distinct partners from messages
      const dbMessages = await Message.find({
        $or: [{ senderUsername: username }, { receiverUsername: username }],
      })
        .sort({ createdAt: -1 })
        .limit(300)
        .lean();

      for (const m of dbMessages) {
        const s: string = ((m as any).senderUsername || "").toLowerCase();
        const r: string = ((m as any).receiverUsername || (m as any).receiverId || "").toLowerCase();
        const partnerUname: string = s === username ? r : s;

        if (partnerUname && partnerUname !== username && !conversationsMap.has(partnerUname)) {
          let preview = (m as any).content;
          if ((m as any).type === "love_ping") {
            const ping = getPingOptionFromContent((m as any).content);
            preview = `${ping.icon} Sent a ${ping.title} Ping!`;
          } else if ((m as any).type === "image") {
            preview = "📷 Photo";
          } else if ((m as any).type === "voice") {
            preview = `🎤 Voice note (${(m as any).audioDuration || 3}s)`;
          } else if ((m as any).type === "sticker") {
            preview = "✨ Sticker";
          }

          if (s === username) {
            preview = `You: ${preview}`;
          }

          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: (s !== username ? (m as any).senderName : null) || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: (s !== username ? (m as any).senderAvatar : null) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: preview,
            lastMessageType: (m as any).type || "text",
            lastMessageTime: (m as any).createdAt ? new Date((m as any).createdAt).toISOString() : new Date().toISOString(),
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // Fetch accepted friend requests (contacts without messages yet)
      const dbAccepted = await FriendRequest.find({
        $or: [{ receiverUsername: username }, { senderUsername: username }],
        status: "accepted",
      }).lean();

      for (const reqItem of dbAccepted) {
        const s: string = ((reqItem as any).senderUsername || "").toLowerCase();
        const r: string = ((reqItem as any).receiverUsername || "").toLowerCase();
        const partnerUname: string = s === username ? r : s;

        if (partnerUname && partnerUname !== username && !conversationsMap.has(partnerUname)) {
          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: (s !== username ? (reqItem as any).senderName : null) || partnerUname.charAt(0).toUpperCase() + partnerUname.slice(1),
            avatar: (s !== username ? (reqItem as any).senderAvatar : null) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`,
            lastMessage: "Connected! Click to chat ✨",
            lastMessageType: "text",
            lastMessageTime: (reqItem as any).createdAt ? new Date((reqItem as any).createdAt).toISOString() : new Date().toISOString(),
            unreadCount: 0,
            status: "online",
          });
        }
      }

      // Enrich avatars & names from User records
      const partnerUsernames = Array.from(conversationsMap.keys());
      if (partnerUsernames.length > 0) {
        const users = await User.find({ username: { $in: partnerUsernames } }).lean();
        for (const u of users) {
          const existing = conversationsMap.get((u as any).username.toLowerCase());
          if (existing) {
            existing.name = (u as any).name || existing.name;
            if ((u as any).avatar) existing.avatar = (u as any).avatar;
            existing.status = (u as any).status || "online";
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Conversations GET DB error:", err.message);
  }

  // ── SECONDARY: In-memory for very recent activity (< 10s, not yet in DB) ──
  const tenSecondsAgo = Date.now() - 10_000;
  const memoryConversations = signalingStore.getConversationsForUser(username);
  for (const c of memoryConversations) {
    if (c.username && c.username !== username && !conversationsMap.has(c.username.toLowerCase())) {
      const msgTime = c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0;
      if (msgTime >= tenSecondsAgo) {
        conversationsMap.set(c.username.toLowerCase(), c);
      }
    }
  }

  // Enrich with live presence data (online/offline status)
  for (const [pUname, conv] of conversationsMap.entries()) {
    const liveU = signalingStore.getUser(pUname);
    if (liveU) {
      conv.name = liveU.name || conv.name;
      conv.avatar = liveU.avatar || conv.avatar;
      conv.status = liveU.status || conv.status;
    }
  }

  const sortedConversations = Array.from(conversationsMap.values()).sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  );

  return NextResponse.json({ conversations: sortedConversations });
}
