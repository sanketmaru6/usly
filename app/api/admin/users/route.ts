import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Message } from "@/lib/models/Message";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { CallSession } from "@/lib/models/CallSession";
import { signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

// GET: List all users with statistics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const usersMap = new Map<string, any>();

    // 1. In-memory presence
    const memoryUsers = signalingStore.searchUsers("", "");
    for (const u of memoryUsers) {
      const uname = u.username.toLowerCase();
      usersMap.set(uname, {
        id: `mem_${uname}`,
        username: u.username,
        name: u.name || u.username,
        avatar: u.avatar,
        status: u.status || "online",
        mood: u.mood || "Ready to chat ✨",
        email: `${uname}@usly.app`,
        coupleCode: "USLY",
        createdAt: new Date().toISOString(),
        source: "memory",
      });
    }

    // 2. Database users
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const dbUsers = await User.find({}).sort({ createdAt: -1 }).lean();
      for (const u of dbUsers) {
        const uname = (u.username || "").toLowerCase().trim();
        const livePresence = signalingStore.getUser(uname);
        usersMap.set(uname, {
          id: (u._id as any).toString(),
          username: u.username,
          name: u.name,
          email: u.email,
          avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
          coupleCode: u.coupleCode || "USLY",
          status: livePresence?.status || (u.status as string) || "offline",
          mood: livePresence?.mood || (u.mood as string) || "Ready to chat ✨",
          createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
          source: "database",
        });
      }
    }

    let allUsers = Array.from(usersMap.values());
    if (q) {
      allUsers = allUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
      );
    }

    // Sort online first, then newest
    allUsers.sort((a, b) => {
      if (a.status === "online" && b.status !== "online") return -1;
      if (b.status === "online" && a.status !== "online") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      success: true,
      users: allUsers,
      total: allUsers.length,
      onlineCount: allUsers.filter((u) => u.status === "online").length,
      dbConnected: dbRes.isConnected,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: Remove a user and associated data
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let username = searchParams.get("username")?.trim().toLowerCase();

    if (!username) {
      try {
        const body = await req.json();
        username = body?.username?.trim().toLowerCase();
      } catch {}
    }

    if (!username) {
      return NextResponse.json({ success: false, error: "Username is required" }, { status: 400 });
    }

    // 1. Clean up from in-memory signalingStore
    signalingStore.removeUser(username);

    // 2. Clean up from MongoDB
    const stats: Record<string, any> = {
      inMemoryDeleted: true,
      userDeleted: 0,
      requestsDeleted: 0,
      messagesDeleted: 0,
      callsDeleted: 0,
    };

    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const userRegex = new RegExp(`^${username}$`, "i");

      const userDel = await User.deleteMany({
        $or: [{ username: userRegex }, { email: new RegExp(`^${username}@`, "i") }],
      });
      stats.userDeleted = userDel.deletedCount;

      const reqDel = await FriendRequest.deleteMany({
        $or: [{ senderUsername: userRegex }, { receiverUsername: userRegex }],
      });
      stats.requestsDeleted = reqDel.deletedCount;

      const msgDel = await Message.deleteMany({
        $or: [{ senderUsername: userRegex }, { receiverUsername: userRegex }],
      });
      stats.messagesDeleted = msgDel.deletedCount;

      const callDel = await CallSession.deleteMany({
        $or: [{ callerUsername: userRegex }, { receiverUsername: userRegex }],
      });
      stats.callsDeleted = callDel.deletedCount;
    }

    return NextResponse.json({
      success: true,
      message: `User @${username} was removed successfully.`,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
