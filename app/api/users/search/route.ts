import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

const DUMMY_USERNAMES = ["sweetheart", "alexa", "priya", "rahul"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const currentUsername = (searchParams.get("currentUsername") || "").trim().toLowerCase();

  const excluded = [currentUsername, ...DUMMY_USERNAMES].filter(Boolean);

  const dbRes = await connectToDatabase();
  let dbUsers: any[] = [];

  if (dbRes.isConnected) {
    try {
      const filter: any = {
        username: { $nin: excluded },
      };
      if (q) {
        filter.$or = [
          { username: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
        ];
      }
      dbUsers = await User.find(filter)
        .sort({ updatedAt: -1 })
        .limit(30)
        .select("username name avatar status mood lastSeen");
    } catch (e: any) {
      console.error("Search DB error:", e.message);
    }
  }

  // Combine with real in-memory users
  const memoryUsers = signalingStore.searchUsers(q, currentUsername);
  const combinedMap = new Map<string, any>();

  for (const u of memoryUsers) {
    if (!excluded.includes(u.username.toLowerCase())) {
      combinedMap.set(u.username.toLowerCase(), u);
    }
  }
  for (const u of dbUsers) {
    if (!excluded.includes(u.username.toLowerCase())) {
      combinedMap.set(u.username.toLowerCase(), {
        username: u.username,
        name: u.name || u.username,
        avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
        status: u.status || "online",
        mood: u.mood || "Ready to chat ✨",
      });
    }
  }

  return NextResponse.json({ users: Array.from(combinedMap.values()) });
}
