import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const memoryData = signalingStore.getRequestsForUser(username);

  const incomingMap = new Map<string, any>();
  const outgoingMap = new Map<string, any>();
  const acceptedMap = new Map<string, any>();

  // 1. Seed with in-memory requests
  for (const r of memoryData.incomingPending) {
    const key = r.senderUsername.toLowerCase() + "_" + r.receiverUsername.toLowerCase();
    incomingMap.set(key, r);
  }
  for (const r of memoryData.outgoingPending) {
    const key = r.senderUsername.toLowerCase() + "_" + r.receiverUsername.toLowerCase();
    outgoingMap.set(key, r);
  }
  for (const r of memoryData.acceptedConnections) {
    const pairKey = [r.senderUsername.toLowerCase(), r.receiverUsername.toLowerCase()].sort().join("_");
    acceptedMap.set(pairKey, r);
  }

  // 2. Fetch and merge from MongoDB with case-insensitive matching
  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const userRegex = new RegExp(`^${username}$`, "i");

      const dbIncoming = await FriendRequest.find({
        receiverUsername: userRegex,
        status: "pending",
      }).sort({ createdAt: -1 });

      const dbOutgoing = await FriendRequest.find({
        senderUsername: userRegex,
        status: "pending",
      }).sort({ createdAt: -1 });

      const dbAccepted = await FriendRequest.find({
        $or: [{ receiverUsername: userRegex }, { senderUsername: userRegex }],
        status: "accepted",
      }).sort({ updatedAt: -1 });

      for (const r of dbIncoming) {
        const item = {
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName || r.senderUsername,
          senderAvatar: r.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.senderUsername}`,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        };
        const key = r.senderUsername.toLowerCase() + "_" + r.receiverUsername.toLowerCase();
        incomingMap.set(key, item);
      }

      for (const r of dbOutgoing) {
        const item = {
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName || r.senderUsername,
          senderAvatar: r.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.senderUsername}`,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        };
        const key = r.senderUsername.toLowerCase() + "_" + r.receiverUsername.toLowerCase();
        outgoingMap.set(key, item);
      }

      for (const r of dbAccepted) {
        const item = {
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName || r.senderUsername,
          senderAvatar: r.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.senderUsername}`,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        };
        const pairKey = [r.senderUsername.toLowerCase(), r.receiverUsername.toLowerCase()].sort().join("_");
        acceptedMap.set(pairKey, item);
      }
    }
  } catch (err: any) {
    console.error("Requests GET error:", err.message);
  }

  // Filter out any pending that have already been accepted
  const finalIncoming: any[] = [];
  for (const [key, r] of incomingMap.entries()) {
    const pairKey = [r.senderUsername.toLowerCase(), r.receiverUsername.toLowerCase()].sort().join("_");
    if (!acceptedMap.has(pairKey)) {
      finalIncoming.push(r);
    }
  }

  return NextResponse.json({
    incomingPending: finalIncoming,
    outgoingPending: Array.from(outgoingMap.values()),
    acceptedConnections: Array.from(acceptedMap.values()),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, senderUsername, senderName, senderAvatar, receiverUsername, requestId } = body;

    // 1. SEND CONNECTION REQUEST
    if (action === "send") {
      if (!senderUsername || !receiverUsername) {
        return NextResponse.json({ error: "Sender and receiver required" }, { status: 400 });
      }

      const sUname = senderUsername.toLowerCase().trim();
      const rUname = receiverUsername.toLowerCase().trim();

      const reqObj = signalingStore.sendRequest(
        sUname,
        senderName || sUname,
        senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sUname}`,
        rUname
      );

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          const saved = await FriendRequest.findOneAndUpdate(
            {
              $or: [
                { senderUsername: new RegExp(`^${sUname}$`, "i"), receiverUsername: new RegExp(`^${rUname}$`, "i") },
                { senderUsername: new RegExp(`^${rUname}$`, "i"), receiverUsername: new RegExp(`^${sUname}$`, "i") },
              ],
            },
            {
              senderUsername: sUname,
              senderName: senderName || sUname,
              senderAvatar: senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sUname}`,
              receiverUsername: rUname,
              status: "pending",
            },
            { upsert: true, new: true }
          );
          if (saved) {
            reqObj.id = saved._id.toString();
          }
        }
      } catch (e: any) {
        console.error("DB send request error:", e.message);
      }

      return NextResponse.json({ success: true, request: reqObj });
    }

    // 2. ACCEPT REQUEST
    if (action === "accept") {
      if (!requestId && !senderUsername && !receiverUsername) {
        return NextResponse.json({ error: "RequestId or users required" }, { status: 400 });
      }

      const accepted = signalingStore.acceptRequest(requestId, senderUsername, receiverUsername);

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          const conditions: any[] = [];
          if (requestId && requestId.length === 24) {
            conditions.push({ _id: requestId });
          }
          if (senderUsername && receiverUsername) {
            const sU = senderUsername.toLowerCase().trim();
            const rU = receiverUsername.toLowerCase().trim();
            conditions.push({ senderUsername: new RegExp(`^${sU}$`, "i"), receiverUsername: new RegExp(`^${rU}$`, "i") });
            conditions.push({ senderUsername: new RegExp(`^${rU}$`, "i"), receiverUsername: new RegExp(`^${sU}$`, "i") });
          }
          if (conditions.length > 0) {
            await FriendRequest.updateMany({ $or: conditions }, { status: "accepted" });
          }
        }
      } catch (e: any) {
        console.error("DB accept request error:", e.message);
      }

      return NextResponse.json({ success: true, request: accepted });
    }

    // 3. DECLINE REQUEST
    if (action === "decline") {
      if (!requestId && !senderUsername && !receiverUsername) {
        return NextResponse.json({ error: "RequestId or users required" }, { status: 400 });
      }

      const declined = signalingStore.declineRequest(requestId, senderUsername, receiverUsername);

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          const conditions: any[] = [];
          if (requestId && requestId.length === 24) {
            conditions.push({ _id: requestId });
          }
          if (senderUsername && receiverUsername) {
            const sU = senderUsername.toLowerCase().trim();
            const rU = receiverUsername.toLowerCase().trim();
            conditions.push({ senderUsername: new RegExp(`^${sU}$`, "i"), receiverUsername: new RegExp(`^${rU}$`, "i") });
            conditions.push({ senderUsername: new RegExp(`^${rU}$`, "i"), receiverUsername: new RegExp(`^${sU}$`, "i") });
          }
          if (conditions.length > 0) {
            await FriendRequest.updateMany({ $or: conditions }, { status: "declined" });
          }
        }
      } catch (e: any) {
        console.error("DB decline request error:", e.message);
      }

      return NextResponse.json({ success: true, request: declined });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
