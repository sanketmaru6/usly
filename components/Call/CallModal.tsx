"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Heart, SwitchCamera, Volume2, VolumeX,
  MessageCircle, Send, Smile,
} from "lucide-react";
import { ICE_SERVERS, soundFX, getUserMediaStream, applySenderBitrates } from "@/lib/webrtc";
import { notificationService } from "@/lib/notifications";

const LOVE_KEYWORDS = [
  "love you", "love u", "i love you", "i love u", "ily",
  "miss you", "miss u", "kiss", "muah", "pyaar", "pyar",
];
const LOVE_EMOJIS_REGEX =
  /[\u2764\uFE0F?\u{1F496}\u{1F495}\u{1F498}\u{1F493}\u{1F497}\u{1F49D}\u{1F49E}\u{1F49F}\u{1F48C}\u{1F48B}\u{1F970}\u{1F60D}\u{1F48F}\u{1F491}]/u;

function isLoveMessage(content: string = ""): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  if (LOVE_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return LOVE_EMOJIS_REGEX.test(content);
}

interface LiveComment {
  id: string;
  senderUsername: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  createdAt?: string;
  isMine?: boolean;
}

interface CallModalProps {
  callId: string;
  isCaller: boolean;
  callType: "audio" | "video";
  myUsername: string;
  myName: string;
  myAvatar: string;
  partnerName: string;
  partnerUsername: string;
  partnerAvatar?: string;
  onEndCall: () => void;
  onTriggerFloatingHeart?: () => void;
}

type Status = "connecting" | "ringing" | "connected" | "no_camera" | "error";

export default function CallModal({
  callId, isCaller, callType,
  myUsername, myName, myAvatar,
  partnerName, partnerUsername, partnerAvatar,
  onEndCall, onTriggerFloatingHeart,
}: CallModalProps) {
  const [status, setStatus]               = useState<Status>(isCaller ? "ringing" : "connecting");
  const [isMicMuted, setIsMicMuted]       = useState(false);
  const [isVideoOff, setIsVideoOff]       = useState(false);
  const [isSpeakerOff, setIsSpeakerOff]   = useState(false);
  const [facingMode, setFacingMode]       = useState<"user" | "environment">("user");
  const [duration, setDuration]           = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [showUI, setShowUI]               = useState(true);
  const [heartBurst, setHeartBurst]       = useState(false);

  // Live Instagram Chat State
  const [showLiveChat, setShowLiveChat]   = useState(callType === "video");
  const [liveMessages, setLiveMessages]   = useState<LiveComment[]>([]);
  const [inCallText, setInCallText]       = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pollRef         = useRef<NodeJS.Timeout | null>(null);
  const esRef           = useRef<EventSource | null>(null);
  const uiTimerRef      = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef    = useRef(true);
  const showLiveChatRef = useRef(showLiveChat);
  const isInputFocusedRef = useRef(isInputFocused);

  // Stale-closure-proof refs
  const onEndCallRef  = useRef(onEndCall);
  const onHeartRef    = useRef(onTriggerFloatingHeart);
  const processedRef  = useRef({ offer: false, answer: false });
  const candidateQueue   = useRef<any[]>([]);
  const addedCandidates  = useRef<Set<string>>(new Set());

  useEffect(() => { onEndCallRef.current = onEndCall; });
  useEffect(() => { onHeartRef.current = onTriggerFloatingHeart; });
  useEffect(() => { showLiveChatRef.current = showLiveChat; }, [showLiveChat]);
  useEffect(() => { isInputFocusedRef.current = isInputFocused; }, [isInputFocused]);

  // Auto-hide controls after 4.5s of no interaction (video mode, if user isn't typing)
  const revealUI = () => {
    setShowUI(true);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (callType === "video" && status === "connected" && !isInputFocusedRef.current) {
      uiTimerRef.current = setTimeout(() => {
        if (!isInputFocusedRef.current) setShowUI(false);
      }, 4500);
    }
  };

  // Safe candidate application with queuing
  const applyCandidate = async (cand: any) => {
    const pc = pcRef.current;
    if (!cand || !pc) return;
    const key = typeof cand === "string" ? cand : JSON.stringify(cand);
    if (addedCandidates.current.has(key)) return;

    if (pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
        addedCandidates.current.add(key);
      } catch (err) {
        console.warn("[WebRTC] addIceCandidate error:", err);
      }
    } else {
      if (!candidateQueue.current.some((c) => (typeof c === "string" ? c : JSON.stringify(c)) === key)) {
        candidateQueue.current.push(cand);
      }
    }
  };

  // Flush queued candidates once remote description is set
  const flushCandidates = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    while (candidateQueue.current.length > 0) {
      const c = candidateQueue.current.shift()!;
      const key = typeof c === "string" ? c : JSON.stringify(c);
      if (!addedCandidates.current.has(key)) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
          addedCandidates.current.add(key);
        } catch (err) {
          console.warn("[WebRTC] flush candidate error:", err);
        }
      }
    }
  };

  // Process incoming signal packet
  const processSignal = async (call: any) => {
    const pc = pcRef.current;
    if (!call || !pc || !isMountedRef.current) return;

    // Filter out any signals for different/old calls
    if (call.callId && call.callId !== callId) return;

    if (call.status === "ended" || call.status === "declined") {
      console.log("[WebRTC] Call ended by remote peer:", call.callId);
      onEndCallRef.current();
      return;
    }

    // 1. Caller receives Answer from Receiver
    if (isCaller && call.answer && !processedRef.current.answer) {
      processedRef.current.answer = true;
      try {
        console.log("[WebRTC] Caller setting remote answer description");
        await pc.setRemoteDescription(new RTCSessionDescription(call.answer));
        await flushCandidates();
        applySenderBitrates(pc, callType === "video");
        if (isMountedRef.current) setStatus("connected");
      } catch (e) {
        console.error("[WebRTC] setRemoteDescription(answer) error:", e);
      }
    }

    // 2. Receiver receives Offer from Caller
    if (!isCaller && call.offer && !processedRef.current.offer) {
      processedRef.current.offer = true;
      try {
        console.log("[WebRTC] Receiver setting remote offer description");
        await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
        await flushCandidates();
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        applySenderBitrates(pc, callType === "video");
        console.log("[WebRTC] Receiver sending answer back");
        await fetch("/api/calls/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "answer",
            callId,
            answer: { type: "answer", sdp: ans.sdp },
          }),
        });
        if (isMountedRef.current) setStatus("connected");
      } catch (e) {
        console.error("[WebRTC] Receiver Offer/Answer error:", e);
      }
    }

    // 3. Apply remote ICE candidates
    const cands = isCaller ? call.receiverCandidates : call.callerCandidates;
    if (Array.isArray(cands)) {
      for (const c of cands) {
        await applyCandidate(c);
      }
    }

    // 4. Reactions
    if (call.lastReaction && Date.now() - call.lastReaction.timestamp < 1500) {
      onHeartRef.current?.();
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 2000);
    }
  };

  // ── Main WebRTC Initialization ───────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    processedRef.current = { offer: false, answer: false };

    // Immediately stop ringtone, vibration, and close system notification once in-call
    notificationService.stopRingtone();

    async function start() {
      // 1. Acquire local user media (camera + microphone)
      let stream: MediaStream;
      let gotVideo = callType === "video";
      try {
        stream = await getUserMediaStream(callType === "video", true, "user");
        if (callType === "video" && stream.getVideoTracks().length === 0) {
          gotVideo = false;
          setStatus("no_camera");
        }
      } catch (err) {
        console.error("[WebRTC] getUserMedia failed:", err);
        setStatus("error");
        return;
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;

      // Render local video in self PiP
      if (localVideoRef.current && gotVideo) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // 2. Initialize RTCPeerConnection with STUN + TURN servers
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Add local audio and video tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 3. Handle remote incoming tracks (video & audio)
      pc.ontrack = (ev) => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] Remote track arrived:", ev.track.kind);

        let inbound = ev.streams && ev.streams[0] ? ev.streams[0] : null;
        if (!inbound) {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          if (!remoteStreamRef.current.getTracks().some((t) => t.id === ev.track.id)) {
            remoteStreamRef.current.addTrack(ev.track);
          }
          inbound = remoteStreamRef.current;
        } else {
          remoteStreamRef.current = inbound;
        }

        // Attach to remote video
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = inbound;
          remoteVideoRef.current.play().catch((e) => console.warn("video play:", e));
        }

        // Audio element playback: only unmute for audio-only calls to prevent duplicate echo
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = inbound;
          if (callType === "audio") {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.play().catch((e) => console.warn("audio play:", e));
          } else {
            remoteAudioRef.current.muted = true; // Video element plays audio
          }
        }

        const hasVid = inbound.getVideoTracks().some((t) => t.readyState === "live");
        if (hasVid) {
          setHasRemoteVideo(true);
        }
        if (isMountedRef.current) setStatus("connected");
      };

      // 4. Track connection state
      pc.onconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] connectionState:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setStatus("connected");
        } else if (pc.connectionState === "failed") {
          console.log("[WebRTC] Connection failed, restarting ICE...");
          pc.restartIce?.();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setStatus("connected");
        } else if (pc.iceConnectionState === "failed") {
          pc.restartIce?.();
        }
      };

      // 5. Send local ICE candidates to remote peer
      pc.onicecandidate = async (ev) => {
        if (!ev.candidate || !isMountedRef.current) return;
        try {
          await fetch("/api/calls/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "candidate",
              callId,
              candidate: ev.candidate.toJSON(),
              isCaller,
            }),
          });
        } catch {}
      };

      // 6. If Caller: create offer and send to signaling server
      if (isCaller) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === "video",
          });
          await pc.setLocalDescription(offer);
          applySenderBitrates(pc, callType === "video");
          console.log("[WebRTC] Caller created and sent offer");
          await fetch("/api/calls/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_offer",
              callId,
              offer: { type: "offer", sdp: offer.sdp },
            }),
          });
        } catch (e) {
          console.error("[WebRTC] Offer failed:", e);
        }
      }

      // 7. Initial signal state fetch
      try {
        const res = await fetch(`/api/calls/signal?callId=${callId}`);
        if (res.ok) {
          const d = await res.json();
          if (d.call) await processSignal(d.call);
        }
      } catch {}

      // 8. Real-time SSE Stream for instant sub-20ms signaling & live chat
      try {
        const es = new EventSource(`/api/calls/stream?callId=${callId}&username=${myUsername}`);
        esRef.current = es;
        es.addEventListener("call_update", (e) => {
          try {
            processSignal(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("candidate", (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.isCaller !== isCaller) applyCandidate(d.candidate);
          } catch {}
        });
        es.addEventListener("message", (e) => {
          try {
            const msg = JSON.parse(e.data);
            const senderUname = (msg.senderUsername || "").toLowerCase();
            const partnerUname = (partnerUsername || "").toLowerCase();
            if (senderUname === partnerUname) {
              setLiveMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [
                  ...prev.slice(-40),
                  {
                    id: msg.id || String(Date.now()),
                    senderUsername: msg.senderUsername,
                    senderName: msg.senderName || msg.senderUsername,
                    senderAvatar: msg.senderAvatar,
                    content: msg.content,
                    createdAt: msg.createdAt,
                    isMine: false,
                  },
                ];
              });
              soundFX.playChatSound();
              if (!showLiveChatRef.current) {
                setUnreadChatCount((c) => c + 1);
              }
              if (isLoveMessage(msg.content)) {
                setHeartBurst(true);
                setTimeout(() => setHeartBurst(false), 2000);
              }
            }
          } catch {}
        });
      } catch {}

      // 9. Polling fallback every 600ms
      pollRef.current = setInterval(async () => {
        if (!isMountedRef.current) return;
        try {
          const r = await fetch(`/api/calls/signal?callId=${callId}`);
          if (r.ok) {
            const d = await r.json();
            if (d.call) await processSignal(d.call);
          }
        } catch {}
      }, 600);

      if (callType === "audio") {
        setTimeout(() => {
          if (isMountedRef.current && status !== "error") setStatus("connected");
        }, 2000);
      }
    }

    start();

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (esRef.current) esRef.current.close();
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // Auto-hide UI controls after call is connected
  useEffect(() => {
    if (status === "connected" && callType === "video") {
      revealUI();
    } else {
      setShowUI(true);
    }
  }, [status, callType]);

  // Duration timer
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Fetch initial in-call messages
  useEffect(() => {
    let active = true;
    async function fetchRecentMessages() {
      try {
        const res = await fetch(
          `/api/messages?myUsername=${encodeURIComponent(myUsername)}&partnerUsername=${encodeURIComponent(partnerUsername)}`
        );
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            const recent: LiveComment[] = data.messages.slice(-30).map((m: any) => ({
              id: m.id || String(m._id || Math.random()),
              senderUsername: m.senderUsername,
              senderName: m.senderName || m.senderUsername,
              senderAvatar: m.senderAvatar,
              content: m.content,
              createdAt: m.createdAt,
              isMine: m.senderUsername?.toLowerCase() === myUsername?.toLowerCase(),
            }));
            setLiveMessages(recent);
          }
        }
      } catch (err) {
        console.warn("Failed to load in-call messages:", err);
      }
    }
    if (myUsername && partnerUsername) {
      fetchRecentMessages();
    }
    return () => {
      active = false;
    };
  }, [myUsername, partnerUsername]);

  // Auto-scroll comments to bottom
  useEffect(() => {
    if (showLiveChat) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveMessages, showLiveChat]);

  const toggleLiveChat = () => {
    setShowLiveChat((prev) => {
      const next = !prev;
      if (next) setUnreadChatCount(0);
      return next;
    });
    revealUI();
  };

  const sendLiveComment = async (customText?: string) => {
    const text = (customText !== undefined ? customText : inCallText).trim();
    if (!text) return;
    setInCallText("");

    const tempId = "live_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const optimisticMsg: LiveComment = {
      id: tempId,
      senderUsername: myUsername,
      senderName: myName,
      senderAvatar: myAvatar,
      content: text,
      createdAt: new Date().toISOString(),
      isMine: true,
    };

    setLiveMessages((prev) => [...prev.slice(-40), optimisticMsg]);
    soundFX.playPop();

    if (isLoveMessage(text)) {
      setHeartBurst(true);
      setTimeout(() => setHeartBurst(false), 2000);
      sendHeart();
    }

    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUsername: myUsername,
          senderName: myName,
          senderAvatar: myAvatar,
          receiverUsername: partnerUsername,
          type: "text",
          content: text,
        }),
      });
    } catch (err) {
      console.error("Failed to send in-call live message:", err);
    }
  };

  // Camera flip (hot-swap front/back)
  const flipCamera = async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    try {
      const ns = await getUserMediaStream(true, false, next);
      const nv = ns.getVideoTracks()[0];
      if (!nv) return;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(nv);
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      stream.addTrack(nv);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch {}
  };

  const toggleMic = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setIsMicMuted(!t.enabled);
    }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setIsVideoOff(!t.enabled);
    }
  };

  const toggleSpeaker = () => {
    const a = remoteAudioRef.current;
    const v = remoteVideoRef.current;
    const next = !isSpeakerOff;
    if (a) a.muted = next;
    if (v) v.muted = next;
    setIsSpeakerOff(next);
  };

  const sendHeart = async () => {
    onTriggerFloatingHeart?.();
    soundFX.playLovePing();
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 2000);
    try {
      await fetch("/api/calls/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reaction", callId, emoji: "💖" }),
      });
    } catch {}
  };

  const endCall = () => {
    notificationService.stopRingtone();
    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end", callId, durationSeconds: duration }),
    }).catch(() => {});
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    onEndCall();
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const avatar = partnerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUsername}`;

  return (
    <div
      className="fixed inset-0 z-[8000] bg-black flex flex-col select-none overflow-hidden"
      style={{ height: "100dvh" }}
      onClick={revealUI}
    >
      {/* Audio element for voice calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* ── Full-screen remote video ─────────────────────────────────────── */}
      <div className="absolute inset-0">
        {callType === "video" && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onLoadedMetadata={() => {
              setHasRemoteVideo(true);
              setStatus("connected");
            }}
            onPlay={() => {
              setHasRemoteVideo(true);
              setStatus("connected");
            }}
            className={`w-full h-full object-cover transition-opacity duration-700 ${
              hasRemoteVideo ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Background when no remote video (connecting / audio call) */}
        {(!hasRemoteVideo || callType === "audio") && (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black flex flex-col items-center justify-center">
            {/* Pulsing rings */}
            <div className="relative flex items-center justify-center mb-8">
              {status !== "error" && (
                <>
                  <div
                    className="absolute w-48 h-48 rounded-full bg-white/5 animate-ping"
                    style={{ animationDuration: "2.5s" }}
                  />
                  <div
                    className="absolute w-36 h-36 rounded-full bg-white/5 animate-ping"
                    style={{ animationDuration: "2.5s", animationDelay: "0.7s" }}
                  />
                </>
              )}
              <div className="relative w-32 h-32 rounded-full overflow-hidden shadow-2xl ring-4 ring-white/20">
                <img src={avatar} alt={partnerName} className="w-full h-full object-cover" />
              </div>
            </div>
            <p className="text-white text-2xl font-bold mb-2">{partnerName}</p>
            <p className="text-white/60 text-sm font-medium">
              {status === "error"
                ? "🚫 Camera / microphone blocked"
                : status === "no_camera"
                ? "Voice call (Camera not available)"
                : status === "ringing"
                ? "Ringing…"
                : status === "connected" && callType === "audio"
                ? fmt(duration)
                : "Connecting HD Video…"}
            </p>
          </div>
        )}

        {/* Gradient scrim — top & bottom for readability */}
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
      </div>

      {/* ── Self PiP (top-right, Instagram position — ALWAYS visible during video call) ── */}
      {callType === "video" && (
        <div
          className="absolute top-16 right-4 z-30 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/25 bg-zinc-900 transition-all duration-300 active:scale-95"
          style={{ width: 96, height: 144 }}
          onClick={(e) => {
            e.stopPropagation();
            flipCamera();
          }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${
              isVideoOff ? "opacity-0" : "opacity-100"
            }`}
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white/50">
              <VideoOff className="w-6 h-6 mb-1 text-zinc-400" />
              <span className="text-[10px]">Off</span>
            </div>
          )}
          {/* Tap to flip hint */}
          <div className="absolute bottom-1 right-1 bg-black/50 backdrop-blur-md rounded-full p-1">
            <SwitchCamera className="w-3 h-3 text-white/80" />
          </div>
        </div>
      )}

      {/* ── Top bar: name + duration (Instagram style) ───────────────────── */}
      <div
        className={`relative z-20 flex items-center space-x-3 px-5 pt-12 transition-opacity duration-300 ${
          showUI || status !== "connected" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/30 flex-shrink-0">
          <img src={avatar} alt={partnerName} className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-white font-bold text-base leading-tight">{partnerName}</p>
          <p className="text-xs text-white/70 leading-tight mt-0.5">
            {status === "connected" ? (
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                <span className="font-mono">{fmt(duration)}</span>
                <span className="text-emerald-400/90 font-medium">HD</span>
              </span>
            ) : status === "ringing" ? (
              "Ringing…"
            ) : (
              "Connecting…"
            )}
          </p>
        </div>
      </div>

      {/* ── Heart burst animation (center screen) ────────────────────────── */}
      {heartBurst && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="text-8xl animate-bounce">💖</div>
        </div>
      )}

      {/* ── Instagram Live Floating Comments Overlay ───────────────────── */}
      {showLiveChat && status === "connected" && (
        <div
          className={`absolute bottom-36 sm:bottom-40 left-3 sm:left-5 z-25 flex flex-col pointer-events-auto transition-all duration-300 max-w-[85vw] sm:max-w-sm ${
            showUI || isInputFocused ? "opacity-100" : "opacity-85 hover:opacity-100"
          }`}
          style={{ maxHeight: 220 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header pill with live pulse & hide button */}
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="flex items-center space-x-1.5 bg-black/45 backdrop-blur-md border border-white/15 px-2.5 py-0.5 rounded-full text-[11px] text-white/90 font-medium shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
              <span>Live Chat</span>
            </div>
            <button
              onClick={() => setShowLiveChat(false)}
              className="text-[10px] text-white/70 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 transition active:scale-95"
            >
              Hide
            </button>
          </div>

          {/* Scrollable comments stream with gradient fade at top */}
          <div
            className="overflow-y-auto space-y-1.5 pr-1 scrollbar-none"
            style={{
              maxHeight: 185,
              maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)",
            }}
          >
            {liveMessages.length === 0 ? (
              <div className="text-[11px] text-white/60 italic px-2 py-1 bg-black/30 backdrop-blur-sm rounded-xl inline-block">
                No comments yet. Say something sweet... ✨
              </div>
            ) : (
              liveMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-start space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                  <img
                    src={msg.senderAvatar || (msg.isMine ? myAvatar : avatar)}
                    alt={msg.senderName}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-white/30 flex-shrink-0 mt-0.5"
                  />
                  <div
                    className={`rounded-2xl px-3 py-1.5 text-xs shadow-lg max-w-[85%] break-words border ${
                      msg.isMine
                        ? "bg-pink-950/60 border-pink-500/30 text-white backdrop-blur-md"
                        : "bg-black/60 border-white/15 text-white backdrop-blur-md"
                    }`}
                  >
                    <span className="font-semibold text-white/95 mr-1.5">
                      {msg.isMine ? "You" : msg.senderName}
                    </span>
                    <span className="text-white/90">{msg.content}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>
      )}

      {/* ── Bottom controls (WhatsApp & Instagram style) ──────────────────── */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 flex flex-col items-center pb-8 sm:pb-10 px-4 transition-opacity duration-300 ${
          showUI || callType === "audio" || isInputFocused || status !== "connected"
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Send Love button when Live Chat is hidden or during audio calls */}
        {(!showLiveChat || status !== "connected") && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              sendHeart();
            }}
            className="mb-4 flex items-center space-x-2 px-6 py-2.5 rounded-full bg-black/50 border border-white/25 backdrop-blur-xl text-white text-sm font-semibold active:scale-95 transition shadow-lg"
          >
            <Heart className="w-4 h-4 fill-pink-500 text-pink-500 animate-pulse" />
            <span>Send Love</span>
          </button>
        )}

        {/* Instagram Live In-Call Comment Input & Quick Reactions Bar */}
        {showLiveChat && status === "connected" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendLiveComment();
            }}
            className="flex items-center space-x-1.5 sm:space-x-2 w-full max-w-sm mb-3 px-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 flex items-center bg-black/60 backdrop-blur-xl border border-white/20 rounded-full px-3.5 py-1.5 sm:py-2 shadow-xl focus-within:border-pink-500/80 transition">
              <input
                type="text"
                value={inCallText}
                onChange={(e) => setInCallText(e.target.value)}
                onFocus={() => {
                  setIsInputFocused(true);
                  setShowUI(true);
                }}
                onBlur={() => setIsInputFocused(false)}
                placeholder={`Comment as ${myUsername}...`}
                className="w-full bg-transparent text-white placeholder-white/50 text-xs sm:text-sm outline-none pr-1"
              />
              {inCallText.trim() && (
                <button
                  type="submit"
                  className="ml-1 p-1 rounded-full bg-pink-500 hover:bg-pink-600 text-white transition active:scale-95 flex-shrink-0 shadow-md"
                  title="Send comment"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick emoji reaction chips (Instagram Live style) */}
            <div className="flex items-center space-x-1">
              {["❤️", "😂", "🔥", "💖", "💋"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => sendLiveComment(emoji)}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/15 flex items-center justify-center text-xs sm:text-sm active:scale-90 transition hover:scale-110 shadow-sm"
                  title={`Send ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </form>
        )}

        {/* Control buttons bar (frosted glass pill) */}
        <div
          className="w-full max-w-sm flex items-center justify-around bg-black/55 backdrop-blur-2xl border border-white/15 rounded-full px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mute microphone */}
          <button
            onClick={toggleMic}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${
              isMicMuted
                ? "bg-red-500/90 shadow-lg shadow-red-500/40 text-white"
                : "bg-white/20 text-white hover:bg-white/30"
            }`}
            title={isMicMuted ? "Unmute mic" : "Mute mic"}
          >
            {isMicMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>

          {/* Video Toggle (video call) / Speaker toggle (audio call) */}
          {callType === "video" ? (
            <button
              onClick={toggleVideo}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${
                isVideoOff
                  ? "bg-red-500/90 shadow-lg shadow-red-500/40 text-white"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
              title={isVideoOff ? "Turn video on" : "Turn video off"}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          ) : (
            <button
              onClick={toggleSpeaker}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${
                isSpeakerOff ? "bg-red-500 text-white" : "bg-white/20 text-white"
              }`}
              title={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
            >
              {isSpeakerOff ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          )}

          {/* Toggle Live Chat Button (Instagram Live style) */}
          <button
            onClick={toggleLiveChat}
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${
              showLiveChat
                ? "bg-pink-500/85 text-white shadow-lg shadow-pink-500/35 border border-pink-400/40"
                : "bg-white/20 text-white hover:bg-white/30"
            }`}
            title={showLiveChat ? "Hide Live Chat" : "Show Live Chat (Instagram Live)"}
          >
            <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            {!showLiveChat && unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-pink-500 text-white rounded-full ring-2 ring-black shadow animate-bounce">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </button>

          {/* Flip camera */}
          {callType === "video" && (
            <button
              onClick={flipCamera}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-90"
              title="Flip camera"
            >
              <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          {/* End call — large WhatsApp/Instagram red button */}
          <button
            onClick={endCall}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-red-600 hover:bg-red-700 active:scale-90 text-white flex items-center justify-center transition shadow-2xl shadow-red-600/50"
            title="End call"
          >
            <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
