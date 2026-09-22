import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { signalingStore } from "@/lib/signalingStore";
import { connectToDatabase } from "@/lib/db";
import { CallSession } from "@/lib/models/CallSession";

export const dynamic = "force-dynamic";

// WebRTC Signaling API
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. INITIATE A CALL
    if (action === "initiate") {
      const {
        callId: providedCallId,
        callerId,
        callerName,
        callerUsername,
        callerAvatar,
        receiverId,
        receiverUsername,
        type,
        offer,
      } = body;

      const callId =
        providedCallId ||
        "call_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

      const newCall = signalingStore.createCall({
        callId,
        callerId: callerId || `usr_${callerUsername}`,
        callerName: callerName || callerUsername,
        callerUsername: (callerUsername || "").toLowerCase().trim(),
        callerAvatar,
        receiverId: receiverId || `usr_${receiverUsername}`,
        receiverUsername: (receiverUsername || "").toLowerCase().trim(),
        type: type || "video",
        status: "ringing",
        offer,
      });

      // Save call session to MongoDB in background if connected
      connectToDatabase().then((dbRes) => {
        if (dbRes.isConnected) {
          CallSession.create({
            callerId: callerId || callerUsername,
            callerName: callerName || callerUsername,
            receiverId: receiverId || receiverUsername,
            receiverName: receiverUsername,
            type: type || "video",
            status: "ringing",
            signalOffer: offer ? JSON.stringify(offer) : undefined,
            startedAt: new Date(),
          }).catch((err) => console.error("CallSession DB error:", err.message));
        }
      });

      return NextResponse.json({ success: true, callId, call: newCall });
    }

    // 2. ANSWER A CALL
    if (action === "answer") {
      const { callId, answer } = body;
      const updated = signalingStore.updateCall(callId, {
        status: "accepted",
        answer,
      });
      return NextResponse.json({ success: true, call: updated });
    }

    // 3. DECLINE OR END A CALL
    if (action === "end" || action === "decline") {
      const { callId, durationSeconds } = body;
      const finalStatus = action === "decline" ? "declined" : "ended";
      const updated = signalingStore.updateCall(callId, {
        status: finalStatus,
        durationSeconds: durationSeconds || 0,
      });

      // Update CallSession in MongoDB in background
      connectToDatabase().then((dbRes) => {
        if (dbRes.isConnected) {
          CallSession.findOneAndUpdate(
            { _id: callId },
            {
              status: finalStatus,
              durationSeconds: durationSeconds || 0,
              endedAt: new Date(),
            }
          ).catch(() => {});
        }
      });

      return NextResponse.json({ success: true, call: updated });
    }

    // 4. ADD ICE CANDIDATE
    if (action === "candidate") {
      const { callId, candidate, isCaller } = body;
      const success = signalingStore.addCandidate(callId, candidate, isCaller);
      return NextResponse.json({ success });
    }

    // 5. SEND LIVE CALL REACTION (Floating heart burst during video call)
    if (action === "reaction") {
      const { callId, emoji } = body;
      const call = signalingStore.getCall(callId);
      if (call) {
        (call as any).lastReaction = { emoji, timestamp: Date.now() };
      }
      return NextResponse.json({ success: true });
    }

    // 6. UPDATE OFFER — sent by caller after camera + PeerConnection is ready
    // This separates the "ring immediately" step from the SDP negotiation step
    if (action === "set_offer") {
      const { callId, offer } = body;
      const updated = signalingStore.updateCall(callId, { offer });
      return NextResponse.json({ success: true, call: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Check for incoming calls or active call state
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();
  const callId = searchParams.get("callId");

  if (callId) {
    const call = signalingStore.getCall(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    return NextResponse.json({ call });
  }

  if (username) {
    const activeCall = signalingStore.findActiveCallForUser(username);
    return NextResponse.json({ activeCall });
  }

  return NextResponse.json({ error: "Username or callId required" }, { status: 400 });
}
