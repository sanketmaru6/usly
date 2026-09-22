import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { signalingStore } from "@/lib/signalingStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const memoryData = signalingStore.getRequestsForUser(username);

  const dbRes = await connectToDatabase();
  if (dbRes.isConnected) {
    try {
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
        incomingPending: dbIncoming.length > 0 ? dbIncoming : memoryData.incomingPending,
        outgoingPending: dbOutgoing.length > 0 ? dbOutgoing : memoryData.outgoingPending,
        acceptedConnections: dbAccepted.length > 0 ? dbAccepted : memoryData.acceptedConnections,
      });
    } catch (err: any) {
      console.error("Requests GET error:", err.message);
    }
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

      const reqObj = signalingStore.sendRequest(
        senderUsername,
        senderName || senderUsername,
        senderAvatar,
        receiverUsername
      );

      const dbRes = await connectToDatabase();
      if (dbRes.isConnected) {
        try {
          await FriendRequest.findOneAndUpdate(
            {
              senderUsername: senderUsername.toLowerCase().trim(),
              receiverUsername: receiverUsername.toLowerCase().trim(),
            },
            {
              senderName: senderName || senderUsername,
              senderAvatar,
              status: "pending",
            },
            { upsert: true, new: true }
          );
        } catch (e: any) {
          console.error("DB send request error:", e.message);
        }
      }

      return NextResponse.json({ success: true, request: reqObj });
    }

    // 2. ACCEPT REQUEST
    if (action === "accept") {
      if (!requestId) {
        return NextResponse.json({ error: "RequestId required" }, { status: 400 });
      }

      const accepted = signalingStore.acceptRequest(requestId);

      const dbRes = await connectToDatabase();
      if (dbRes.isConnected) {
        try {
          if (requestId.length === 24) {
            await FriendRequest.findByIdAndUpdate(requestId, { status: "accepted" });
          }
        } catch (e: any) {
          console.error("DB accept request error:", e.message);
        }
      }

      return NextResponse.json({ success: true, request: accepted });
    }

    // 3. DECLINE REQUEST
    if (action === "decline") {
      if (!requestId) {
        return NextResponse.json({ error: "RequestId required" }, { status: 400 });
      }

      const declined = signalingStore.declineRequest(requestId);

      const dbRes = await connectToDatabase();
      if (dbRes.isConnected) {
        try {
          if (requestId.length === 24) {
            await FriendRequest.findByIdAndUpdate(requestId, { status: "declined" });
          }
        } catch (e: any) {
          console.error("DB decline request error:", e.message);
        }
      }

      return NextResponse.json({ success: true, request: declined });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
