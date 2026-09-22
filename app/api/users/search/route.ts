import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { signalingStore } from "@/lib/signalingStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const currentUsername = searchParams.get("currentUsername") || "";

  const dbRes = await connectToDatabase();
  let dbUsers: any[] = [];

  if (dbRes.isConnected) {
    try {
      const filter: any = {
        username: { $ne: currentUsername.toLowerCase() },
      };
      if (q.trim()) {
        filter.$or = [
          { username: { $regex: q.trim(), $options: "i" } },
          { name: { $regex: q.trim(), $options: "i" } },
        ];
      }
      dbUsers = await User.find(filter).limit(20).select("username name avatar status mood lastSeen");
    } catch (e: any) {
      console.error("Search DB error:", e.message);
    }
  }

  // Combine with in-memory users
  const memoryUsers = signalingStore.searchUsers(q, currentUsername);
  const combinedMap = new Map();

  for (const u of memoryUsers) {
    combinedMap.set(u.username, u);
  }
  for (const u of dbUsers) {
    combinedMap.set(u.username, {
      username: u.username,
      name: u.name,
      avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
      status: u.status || "online",
      mood: u.mood || "In love 🥰",
    });
  }

  return NextResponse.json({ users: Array.from(combinedMap.values()) });
}
