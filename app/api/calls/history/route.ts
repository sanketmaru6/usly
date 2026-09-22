import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { CallSession } from "@/lib/models/CallSession";
import { signalingStore } from "@/lib/signalingStore";
import { User } from "@/lib/models/User";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const callHistory: any[] = [];
  const dbRes = await connectToDatabase();

  if (dbRes.isConnected) {
    try {
      const dbCalls = await CallSession.find({
        $or: [
          { callerId: username },
          { receiverId: username },
          { callerName: username },
          { receiverName: username },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(100);

      // Fetch user avatars and names for enrichment
      const userNames = new Set<string>();
      dbCalls.forEach((c) => {
        if (c.callerName) userNames.add(c.callerName.toLowerCase());
        if (c.receiverName) userNames.add(c.receiverName.toLowerCase());
      });

      const usersMap = new Map<string, any>();
      if (userNames.size > 0) {
        const users = await User.find({ username: { $in: Array.from(userNames) } });
        users.forEach((u) => usersMap.set(u.username.toLowerCase(), u));
      }

      for (const call of dbCalls) {
        const cCaller = (call.callerName || String(call.callerId)).toLowerCase();
        const cReceiver = (call.receiverName || String(call.receiverId)).toLowerCase();
        const isOutgoing = cCaller === username;
        const partnerUsername = isOutgoing ? cReceiver : cCaller;

        const partnerUser = usersMap.get(partnerUsername);
        const partnerName = partnerUser?.name || partnerUsername.charAt(0).toUpperCase() + partnerUsername.slice(1);
        const partnerAvatar = partnerUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUsername}`;

        callHistory.push({
          id: call._id.toString(),
          callId: call._id.toString(),
          callerUsername: cCaller,
          callerName: isOutgoing ? "You" : partnerName,
          callerAvatar: isOutgoing ? "" : partnerAvatar,
          receiverUsername: cReceiver,
          receiverName: !isOutgoing ? "You" : partnerName,
          type: call.type || "video",
          status: call.status || "ended",
          durationSeconds: call.durationSeconds || 0,
          isOutgoing,
          partnerUsername,
          partnerName,
          partnerAvatar,
          createdAt: call.createdAt ? call.createdAt.toISOString() : new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error("Call History DB Error:", err.message);
    }
  }

  // If DB returned few or no records, include in-memory calls or demo call logs
  if (callHistory.length === 0) {
    const memorySignals = Array.from((global as any).liveSignals?.values() || []);
    for (const s of memorySignals as any[]) {
      const cCaller = (s.callerUsername || "").toLowerCase();
      const cReceiver = (s.receiverUsername || "").toLowerCase();
      if (cCaller === username || cReceiver === username) {
        const isOutgoing = cCaller === username;
        const partnerUsername = isOutgoing ? cReceiver : cCaller;
        callHistory.push({
          id: s.callId,
          callId: s.callId,
          callerUsername: cCaller,
          callerName: s.callerName || cCaller,
          callerAvatar: s.callerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cCaller}`,
          receiverUsername: cReceiver,
          receiverName: cReceiver,
          type: s.type || "video",
          status: s.status || "ended",
          durationSeconds: s.durationSeconds || 0,
          isOutgoing,
          partnerUsername,
          partnerName: partnerUsername.charAt(0).toUpperCase() + partnerUsername.slice(1),
          partnerAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUsername}`,
          createdAt: new Date(s.updatedAt || Date.now()).toISOString(),
        });
      }
    }
  }

  return NextResponse.json({ calls: callHistory });
}
