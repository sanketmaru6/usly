import { NextRequest } from "next/server";
import { signalingEmitter, signalingStore } from "@/lib/signalingStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.toLowerCase().trim();
  const callId = searchParams.get("callId");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Helper to send SSE packet
      const sendEvent = (event: string, data: any) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (e) {
          // Stream might be closed
        }
      };

      // Send initial heartbeat & current state
      sendEvent("ping", { time: Date.now() });

      if (username) {
        const active = signalingStore.findActiveCallForUser(username);
        if (active) {
          sendEvent("call", { type: "active_call", call: active });
        }
      }

      if (callId) {
        const call = signalingStore.getCall(callId);
        if (call) {
          sendEvent("call_update", call);
        }
      }

      // Event listeners
      const onUserCall = (data: any) => {
        sendEvent("call", data);
      };

      const onCallUpdate = (call: any) => {
        sendEvent("call_update", call);
      };

      const onCandidate = (candData: any) => {
        sendEvent("candidate", candData);
      };

      const onMessage = (msg: any) => {
        sendEvent("message", msg);
      };

      const onRequest = (reqData: any) => {
        sendEvent("request", reqData);
      };

      if (username) {
        signalingEmitter.on("call:" + username, onUserCall);
        signalingEmitter.on("message:" + username, onMessage);
        signalingEmitter.on("request:" + username, onRequest);
        signalingEmitter.on("request_update:" + username, onRequest);
      }

      if (callId) {
        signalingEmitter.on("call_update:" + callId, onCallUpdate);
        signalingEmitter.on("candidate:" + callId, onCandidate);
      }

      // Keepalive heartbeat
      const heartbeat = setInterval(() => {
        sendEvent("ping", { time: Date.now() });
      }, 15000);

      // Cleanup on connection abort
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (username) {
          signalingEmitter.off("call:" + username, onUserCall);
          signalingEmitter.off("message:" + username, onMessage);
          signalingEmitter.off("request:" + username, onRequest);
          signalingEmitter.off("request_update:" + username, onRequest);
        }
        if (callId) {
          signalingEmitter.off("call_update:" + callId, onCallUpdate);
          signalingEmitter.off("candidate:" + callId, onCandidate);
        }
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
