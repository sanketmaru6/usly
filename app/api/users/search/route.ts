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
  const currentName = searchParams.get("currentName") || "";
  const currentAvatar = searchParams.get("currentAvatar") || "";

  // Refresh current user presence on heartbeat / search call
  if (currentUsername) {
    signalingStore.registerUser({
      username: currentUsername,
      name: currentName || currentUsername,
      avatar: currentAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
      status: "online",
    });
  }

  const combinedMap = new Map<string, any>();

  // 1. Always load ALL in-memory live users first (fastest, O(n))
  const memoryUsers = signalingStore.searchUsers(q, currentUsername);
  for (const u of memoryUsers) {
    const uname = u.username.toLowerCase();
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

  // 2. Fetch from MongoDB (persists across server restarts)
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {

      // ── Primary: User collection ──────────────────────────────────────────
      const filter: any = {};
      if (q) {
        filter.$or = [
          { username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        ];
      }

      const dbUsers = await User.find(filter)
        .sort({ updatedAt: -1 })
        .limit(500)
        .select("username name avatar status mood lastSeen")
        .lean();

      for (const u of dbUsers) {
        const uname = (u.username || "").toLowerCase().trim();
        if (uname && uname !== currentUsername) {
          const livePresence = signalingStore.getUser(uname);
          combinedMap.set(uname, {
            username: u.username,
            name: (u.name as string) || u.username,
            avatar: (u.avatar as string) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
            status: livePresence?.status || (u.status as string) || "online",
            mood: livePresence?.mood || (u.mood as string) || "Ready to chat ✨",
          });
        }
      }

      // ── Additional: discover any users from FriendRequests ────────────────
      const reqQuery: any = {};
      if (q) {
        reqQuery.$or = [
          { senderUsername: { $regex: q, $options: "i" } },
          { receiverUsername: { $regex: q, $options: "i" } },
          { senderName: { $regex: q, $options: "i" } },
        ];
      }
      const existingReqs = await FriendRequest.find(reqQuery)
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      for (const r of existingReqs) {
        const s = (r.senderUsername || "").toLowerCase().trim();
        const rec = (r.receiverUsername || "").toLowerCase().trim();
        if (s && s !== currentUsername && !combinedMap.has(s)) {
          const livePresence = signalingStore.getUser(s);
          combinedMap.set(s, {
            username: r.senderUsername,
            name: (r as any).senderName || r.senderUsername,
            avatar: (r as any).senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.senderUsername}`,
            status: livePresence?.status || "online",
            mood: livePresence?.mood || "Ready to chat ✨",
          });
        }
        if (rec && rec !== currentUsername && !combinedMap.has(rec)) {
          const livePresence = signalingStore.getUser(rec);
          combinedMap.set(rec, {
            username: r.receiverUsername,
            name: r.receiverUsername,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.receiverUsername}`,
            status: livePresence?.status || "online",
            mood: livePresence?.mood || "Ready to chat ✨",
          });
        }
      }

      // ── Additional: discover any users from Messages ──────────────────────
      const msgQuery: any = {};
      if (q) {
        msgQuery.$or = [
          { senderUsername: { $regex: q, $options: "i" } },
          { receiverUsername: { $regex: q, $options: "i" } },
          { senderName: { $regex: q, $options: "i" } },
        ];
      }
      const existingMsgs = await Message.find(msgQuery)
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      for (const m of existingMsgs) {
        const s = (m.senderUsername || "").toLowerCase().trim();
        const rec = (m.receiverUsername || "").toLowerCase().trim();
        if (s && s !== currentUsername && !combinedMap.has(s)) {
          const livePresence = signalingStore.getUser(s);
          combinedMap.set(s, {
            username: m.senderUsername,
            name: (m as any).senderName || m.senderUsername,
            avatar: (m as any).senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.senderUsername}`,
            status: livePresence?.status || "online",
            mood: livePresence?.mood || "Ready to chat ✨",
          });
        }
        if (rec && rec !== currentUsername && !combinedMap.has(rec)) {
          const livePresence = signalingStore.getUser(rec);
          combinedMap.set(rec, {
            username: m.receiverUsername,
            name: m.receiverUsername,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.receiverUsername}`,
            status: livePresence?.status || "online",
            mood: livePresence?.mood || "Ready to chat ✨",
          });
        }
      }
    }
  } catch (e: any) {
    console.error("Search DB error:", e.message);
  }

  // Sort: online users first, then alphabetically by name
  const sorted = Array.from(combinedMap.values()).sort((a, b) => {
    if (a.status === "online" && b.status !== "online") return -1;
    if (b.status === "online" && a.status !== "online") return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  return NextResponse.json({ users: sorted, total: sorted.length });
}
