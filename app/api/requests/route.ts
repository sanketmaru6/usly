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

  try {
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      const dbIncoming = await FriendRequest.find({
        receiverUsername: username,
        status: "pending",
      });

      const dbOutgoing = await FriendRequest.find({
        senderUsername: username,
        status: "pending",
      });

      const dbAccepted = await FriendRequest.find({
        $or: [{ receiverUsername: username }, { senderUsername: username }],
        status: "accepted",
      });

      return NextResponse.json({
        incomingPending: dbIncoming.map((r) => ({
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName,
          senderAvatar: r.senderAvatar,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        })),
        outgoingPending: dbOutgoing.map((r) => ({
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName,
          senderAvatar: r.senderAvatar,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        })),
        acceptedConnections: dbAccepted.map((r) => ({
          id: r._id.toString(),
          senderUsername: r.senderUsername,
          senderName: r.senderName,
          senderAvatar: r.senderAvatar,
          receiverUsername: r.receiverUsername,
          status: r.status,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        })),
      });
    }
  } catch (err: any) {
    console.error("Requests GET error:", err.message);
  }

  return NextResponse.json(memoryData);
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
                { senderUsername: sUname, receiverUsername: rUname },
                { senderUsername: rUname, receiverUsername: sUname },
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

      const accepted = requestId ? signalingStore.acceptRequest(requestId) : null;

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          if (requestId && requestId.length === 24) {
            await FriendRequest.findByIdAndUpdate(requestId, { status: "accepted" });
          } else if (senderUsername && receiverUsername) {
            await FriendRequest.findOneAndUpdate(
              {
                $or: [
                  { senderUsername: senderUsername.toLowerCase(), receiverUsername: receiverUsername.toLowerCase() },
                  { senderUsername: receiverUsername.toLowerCase(), receiverUsername: senderUsername.toLowerCase() },
                ],
              },
              { status: "accepted" }
            );
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

      const declined = requestId ? signalingStore.declineRequest(requestId) : null;

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          if (requestId && requestId.length === 24) {
            await FriendRequest.findByIdAndUpdate(requestId, { status: "declined" });
          } else if (senderUsername && receiverUsername) {
            await FriendRequest.findOneAndUpdate(
              {
                $or: [
                  { senderUsername: senderUsername.toLowerCase(), receiverUsername: receiverUsername.toLowerCase() },
                  { senderUsername: receiverUsername.toLowerCase(), receiverUsername: senderUsername.toLowerCase() },
                ],
              },
              { status: "declined" }
            );
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
