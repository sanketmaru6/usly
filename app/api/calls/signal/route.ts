import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { signalingStore } from "@/lib/signalingStore";
import { connectToDatabase } from "@/lib/db";
import { CallSession } from "@/lib/models/CallSession";

export const dynamic = "force-dynamic";

// WebRTC Signaling API (Cross-Instance Serverless Support)
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

      const callerU = (callerUsername || "").toLowerCase().trim();
      const receiverU = (receiverUsername || "").toLowerCase().trim();

      const newCallData = {
        callId,
        callerId: callerId || `usr_${callerU}`,
        callerName: callerName || callerU,
        callerUsername: callerU,
        callerAvatar: callerAvatar || "",
        receiverId: receiverId || `usr_${receiverU}`,
        receiverName: receiverU,
        receiverUsername: receiverU,
        type: (type as "audio" | "video") || "video",
        status: "ringing" as const,
        offer: offer || null,
        callerCandidates: [],
        receiverCandidates: [],
        durationSeconds: 0,
        updatedAt: Date.now(),
      };

      // In-memory store
      signalingStore.createCall(newCallData);

      // Save to MongoDB for cross-serverless persistence
      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          await CallSession.findOneAndUpdate(
            { callId },
            {
              $setOnInsert: {
                callId,
                callerId: callerId || `usr_${callerU}`,
                callerName: callerName || callerU,
                callerUsername: callerU,
                callerAvatar: callerAvatar || "",
                receiverId: receiverId || `usr_${receiverU}`,
                receiverName: receiverU,
                receiverUsername: receiverU,
                type: type || "video",
                status: "ringing",
                callerCandidates: [],
                receiverCandidates: [],
                startedAt: new Date(),
              },
              $set: {
                ...(offer ? { offer } : {}),
                updatedAt: new Date(),
              },
            },
            { upsert: true, new: true }
          );
        }
      } catch (err: any) {
        console.error("Initiate call DB error:", err.message);
      }

      return NextResponse.json({ success: true, callId, call: newCallData });
    }

    // 2. SET OR UPDATE OFFER (Guaranteed MongoDB persistence + instant in-memory update)
    if (action === "set_offer") {
      const { callId, offer } = body;
      signalingStore.updateCall(callId, { offer });

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          await CallSession.findOneAndUpdate(
            { callId },
            { $set: { offer, updatedAt: new Date() } },
            { upsert: true }
          );
        }
      } catch (e: any) {
        console.error("set_offer DB error:", e.message);
      }

      return NextResponse.json({ success: true });
    }

    // 3. ANSWER A CALL (Guaranteed MongoDB persistence + instant in-memory broadcast)
    if (action === "answer") {
      const { callId, answer } = body;
      const updated = signalingStore.updateCall(callId, {
        status: "accepted",
        answer,
      });

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          await CallSession.findOneAndUpdate(
            { callId },
            {
              $set: {
                status: "accepted",
                answer,
                updatedAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
      } catch (err: any) {
        console.error("Answer call DB error:", err.message);
      }

      return NextResponse.json({ success: true, call: updated });
    }

    // 4. DECLINE OR END A CALL
    if (action === "end" || action === "decline") {
      const { callId, durationSeconds } = body;
      const finalStatus = action === "decline" ? "declined" : "ended";
      const updated = signalingStore.updateCall(callId, {
        status: finalStatus,
        durationSeconds: durationSeconds || 0,
      });

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          await CallSession.findOneAndUpdate(
            { callId },
            {
              status: finalStatus,
              durationSeconds: durationSeconds || 0,
              endedAt: new Date(),
              updatedAt: new Date(),
            }
          );
        }
      } catch (err: any) {
        console.error("End call DB error:", err.message);
      }

      return NextResponse.json({ success: true, call: updated });
    }

    // 5. ADD ICE CANDIDATE
    if (action === "candidate") {
      const { callId, candidate, isCaller } = body;
      signalingStore.addCandidate(callId, candidate, isCaller);

      if (candidate) {
        connectToDatabase()
          .then((dbRes) => {
            if (dbRes.isConnected) {
              const updateField = isCaller ? "callerCandidates" : "receiverCandidates";
              CallSession.findOneAndUpdate(
                { callId },
                {
                  $push: { [updateField]: candidate },
                  $set: { updatedAt: new Date() },
                },
                { upsert: true }
              ).catch((e: any) => console.error("candidate DB error:", e.message));
            }
          })
          .catch(() => {});
      }

      return NextResponse.json({ success: true });
    }

    // 6. SEND LIVE CALL REACTION (Floating heart burst during video call)
    if (action === "reaction") {
      const { callId, emoji } = body;
      const call = signalingStore.getCall(callId);
      if (call) {
        (call as any).lastReaction = { emoji, timestamp: Date.now() };
      }

      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          await CallSession.findOneAndUpdate(
            { callId },
            { lastReaction: { emoji, timestamp: Date.now() } }
          );
        }
      } catch {}

      return NextResponse.json({ success: true });
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

  // 1. Specific Call Query
  if (callId) {
    let callObj = signalingStore.getCall(callId);

    // Sync with MongoDB if call not in memory, or if peer is waiting for offer/answer, or during active call
    const needsSync =
      !callObj ||
      !callObj.offer ||
      !callObj.answer ||
      callObj.status === "ringing" ||
      callObj.status === "accepted";

    if (needsSync) {
      try {
        const dbRes = await connectToDatabase();
        if (dbRes.isConnected) {
          const dbCall = await CallSession.findOne({ callId });
          if (dbCall) {
            const mergedCall = {
              callId: dbCall.callId,
              callerId: dbCall.callerId,
              callerName: dbCall.callerName,
              callerUsername: dbCall.callerUsername,
              callerAvatar: dbCall.callerAvatar,
              receiverId: dbCall.receiverId,
              receiverName: dbCall.receiverName,
              receiverUsername: dbCall.receiverUsername,
              receiverAvatar: dbCall.receiverAvatar,
              type: dbCall.type,
              status: dbCall.status,
              durationSeconds: dbCall.durationSeconds,
              offer: dbCall.offer || callObj?.offer,
              answer: dbCall.answer || callObj?.answer,
              callerCandidates: Array.from(new Set([
                ...(callObj?.callerCandidates || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
                ...(dbCall.callerCandidates || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
              ])).map((s: string) => {
                try { return JSON.parse(s); } catch { return s; }
              }),
              receiverCandidates: Array.from(new Set([
                ...(callObj?.receiverCandidates || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
                ...(dbCall.receiverCandidates || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
              ])).map((s: string) => {
                try { return JSON.parse(s); } catch { return s; }
              }),
              lastReaction: dbCall.lastReaction || callObj?.lastReaction,
              updatedAt: dbCall.updatedAt ? new Date(dbCall.updatedAt).getTime() : Date.now(),
            };
            signalingStore.updateCall(callId, mergedCall);
            callObj = mergedCall as any;
          }
        }
      } catch (err: any) {
        console.error("GET callId DB sync error:", err.message);
      }
    }

    if (callObj) {
      return NextResponse.json({ call: callObj });
    }

    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  // 2. Active Call Query by Username
  if (username) {
    // Check in-memory first for instant ringing detection
    const memActive = signalingStore.findActiveCallForUser(username);
    if (memActive) {
      return NextResponse.json({ activeCall: memActive });
    }

    // Check MongoDB fallback
    try {
      const dbRes = await connectToDatabase();
      if (dbRes.isConnected) {
        const now = Date.now();
        const safeRegex = new RegExp(`^${username.trim()}$`, "i");
        const activeDbCall = await CallSession.findOne({
          $or: [{ receiverUsername: safeRegex }, { callerUsername: safeRegex }],
          status: { $in: ["ringing", "accepted"] },
        }).sort({ updatedAt: -1 });

        if (activeDbCall) {
          const callUpdatedTime = activeDbCall.updatedAt ? new Date(activeDbCall.updatedAt).getTime() : now;
          if (activeDbCall.status === "ringing" && now - callUpdatedTime > 45000) {
            await CallSession.updateOne({ callId: activeDbCall.callId }, { status: "missed" });
          } else {
            return NextResponse.json({
              activeCall: {
                callId: activeDbCall.callId,
                callerId: activeDbCall.callerId,
                callerName: activeDbCall.callerName,
                callerUsername: activeDbCall.callerUsername,
                callerAvatar: activeDbCall.callerAvatar,
                receiverId: activeDbCall.receiverId,
                receiverName: activeDbCall.receiverName,
                receiverUsername: activeDbCall.receiverUsername,
                receiverAvatar: activeDbCall.receiverAvatar,
                type: activeDbCall.type,
                status: activeDbCall.status,
                durationSeconds: activeDbCall.durationSeconds,
                offer: activeDbCall.offer,
                answer: activeDbCall.answer,
                callerCandidates: activeDbCall.callerCandidates || [],
                receiverCandidates: activeDbCall.receiverCandidates || [],
                lastReaction: activeDbCall.lastReaction,
                updatedAt: callUpdatedTime,
              },
            });
          }
        }
      }
    } catch (err: any) {
      console.error("GET activeCall DB error:", err.message);
    }

    return NextResponse.json({ activeCall: null });
  }

  return NextResponse.json({ error: "Username or callId required" }, { status: 400 });
}
