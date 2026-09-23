import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { Message } from "@/lib/models/Message";
import { signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const currentUsername = (searchParams.get("currentUsername") || "").trim().toLowerCase();

  const combinedMap = new Map<string, any>();

  // 1. Gather all in-memory live users
  const memoryUsers = signalingStore.searchUsers(q, currentUsername);
  for (const u of memoryUsers) {
    const uname = u.username.toLowerCase();
    if (uname !== currentUsername) {
      combinedMap.set(uname, u);
    }
  }

  // 2. Fetch all registered users from MongoDB
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const filter: any = {};
      if (currentUsername) {
        filter.username = { $not: new RegExp(`^${currentUsername}$`, "i") };
      }
      if (q) {
        filter.$or = [
          { username: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
        ];
      }

      const dbUsers = await User.find(filter)
        .sort({ updatedAt: -1 })
        .limit(500)
        .select("username name avatar status mood lastSeen");

      for (const u of dbUsers) {
        const uname = (u.username || "").toLowerCase();
        if (uname && uname !== currentUsername) {
          combinedMap.set(uname, {
            username: u.username,
            name: u.name || u.username,
            avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
            status: u.status || "online",
            mood: u.mood || "Ready to chat ✨",
          });
        }
      }

      // 3. Fallback: discover users from existing FriendRequests
      const reqQuery: any = {};
      if (q) {
        reqQuery.$or = [
          { senderUsername: { $regex: q, $options: "i" } },
          { receiverUsername: { $regex: q, $options: "i" } },
        ];
      }
      const existingReqs = await FriendRequest.find(reqQuery).sort({ createdAt: -1 }).limit(100);
      for (const r of existingReqs) {
        const s = (r.senderUsername || "").toLowerCase();
        const rec = (r.receiverUsername || "").toLowerCase();
        if (s && s !== currentUsername && !combinedMap.has(s)) {
          combinedMap.set(s, {
            username: r.senderUsername,
            name: r.senderName || r.senderUsername,
            avatar: r.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.senderUsername}`,
            status: "online",
            mood: "Ready to chat ✨",
          });
        }
        if (rec && rec !== currentUsername && !combinedMap.has(rec)) {
          combinedMap.set(rec, {
            username: r.receiverUsername,
            name: r.receiverUsername,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.receiverUsername}`,
            status: "online",
            mood: "Ready to chat ✨",
          });
        }
      }

      // 4. Fallback: discover users from existing Messages
      const msgQuery: any = {};
      if (q) {
        msgQuery.$or = [
          { senderUsername: { $regex: q, $options: "i" } },
          { receiverUsername: { $regex: q, $options: "i" } },
        ];
      }
      const existingMsgs = await Message.find(msgQuery).sort({ createdAt: -1 }).limit(100);
      for (const m of existingMsgs) {
        const s = (m.senderUsername || "").toLowerCase();
        const rec = (m.receiverUsername || "").toLowerCase();
        if (s && s !== currentUsername && !combinedMap.has(s)) {
          combinedMap.set(s, {
            username: m.senderUsername,
            name: m.senderName || m.senderUsername,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.senderUsername}`,
            status: "online",
            mood: "Ready to chat ✨",
          });
        }
        if (rec && rec !== currentUsername && !combinedMap.has(rec)) {
          combinedMap.set(rec, {
            username: m.receiverUsername,
            name: m.receiverUsername,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.receiverUsername}`,
            status: "online",
            mood: "Ready to chat ✨",
          });
        }
      }
    }
  } catch (e: any) {
    console.error("Search DB error:", e.message);
  }

  return NextResponse.json({ users: Array.from(combinedMap.values()) });
}
