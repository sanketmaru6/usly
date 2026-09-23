"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Heart, SwitchCamera, Volume2, VolumeX,
  MessageCircle, Send, Lock, Maximize2, Minimize2, Sparkles,
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
  const [status, setStatus]                     = useState<Status>(isCaller ? "ringing" : "connecting");
  const [isMicMuted, setIsMicMuted]             = useState(false);
  const [isVideoOff, setIsVideoOff]             = useState(false);
  const [isSpeakerOff, setIsSpeakerOff]         = useState(false);
  const [facingMode, setFacingMode]             = useState<"user" | "environment">("user");
  const [duration, setDuration]                 = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo]     = useState(false);
  const [showUI, setShowUI]                     = useState(true);
  const [heartBurst, setHeartBurst]             = useState(false);
  const [showLiveChat, setShowLiveChat]         = useState(callType === "video");
  const [liveMessages, setLiveMessages]         = useState<LiveComment[]>([]);
  const [inCallText, setInCallText]             = useState("");
  const [unreadChatCount, setUnreadChatCount]   = useState(0);
  const [isInputFocused, setIsInputFocused]     = useState(false);
  const [isFitMode, setIsFitMode]               = useState(false);
  const [isSwapped, setIsSwapped]               = useState(false);
  const [pipCorner, setPipCorner]               = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left">("top-right");
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; left: number }[]>([]);
  const lastTapRef                              = useRef<number>(0);

  // DOM refs
  const localVideoRef  = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  // WebRTC refs (all stable)
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pollRef         = useRef<NodeJS.Timeout | null>(null);
  const esRef           = useRef<EventSource | null>(null);
  const uiTimerRef      = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef    = useRef(true);
  const showLiveChatRef = useRef(showLiveChat);
  const isInputFocusedRef  = useRef(isInputFocused);
  const facingModeRef      = useRef(facingMode);
  const isSpeakerOffRef    = useRef(isSpeakerOff);
  const durationRef        = useRef(0);
  const statusRef          = useRef<Status>(isCaller ? "ringing" : "connecting");

  // Stale-closure-proof callback refs
  const onEndCallRef  = useRef(onEndCall);
  const onHeartRef    = useRef(onTriggerFloatingHeart);
  useEffect(() => { onEndCallRef.current = onEndCall; });
  useEffect(() => { onHeartRef.current = onTriggerFloatingHeart; });
  useEffect(() => { showLiveChatRef.current = showLiveChat; }, [showLiveChat]);
  useEffect(() => { isInputFocusedRef.current = isInputFocused; }, [isInputFocused]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);
  useEffect(() => { isSpeakerOffRef.current = isSpeakerOff; }, [isSpeakerOff]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // ─── Attach remote stream helper (called from multiple places) ───────────
  const attachRemoteStream = (stream: MediaStream) => {
    const rv = remoteVideoRef.current;
    const ra = remoteAudioRef.current;
    if (rv && rv.srcObject !== stream) {
      rv.srcObject = stream;
      rv.play().catch(() => { if (rv) { rv.muted = true; rv.play().catch(() => {}); } });
    }
    if (ra && ra.srcObject !== stream) {
      ra.srcObject = stream;
      ra.muted = isSpeakerOffRef.current;
      ra.play().catch(() => {});
    }
    if (stream.getVideoTracks().length > 0) {
      setHasRemoteVideo(true);
    }
    if (isMountedRef.current) setStatus("connected");
  };

  // ─── UI reveal / auto-hide ────────────────────────────────────────────────
  const revealUI = () => {
    setShowUI(true);
    if (remoteVideoRef.current?.paused) remoteVideoRef.current.play().catch(() => {});
    if (remoteAudioRef.current?.paused)  remoteAudioRef.current.play().catch(() => {});
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    if (callType === "video" && statusRef.current === "connected" && !isInputFocusedRef.current) {
      uiTimerRef.current = setTimeout(() => {
        if (!isInputFocusedRef.current) setShowUI(false);
      }, 4500);
    }
  };

  // ─── Main WebRTC engine (everything inside one useEffect) ─────────────────
  useEffect(() => {
    isMountedRef.current = true;
    notificationService.stopRingtone();

    // Internal state (no stale closures)
    const processed = { offer: false, answer: false };
    const candQueue: RTCIceCandidateInit[] = [];
    const addedKeys = new Set<string>();
    const pendingSignals: any[] = [];
    let pendingRemoteAnswer: any = null;
    let isSettingOffer = false;
    let isSettingAnswer = false;
    let pcReady = false;

    // ── Candidate helpers ────────────────────────────────────────────────────
    function normalizeCand(raw: any): RTCIceCandidateInit | null {
      if (!raw) return null;
      let obj = raw;
      if (typeof raw === "string") {
        try { obj = JSON.parse(raw); } catch { obj = { candidate: raw }; }
      }
      if (!obj || typeof obj.candidate !== "string" || !obj.candidate.trim()) return null;
      const cand: RTCIceCandidateInit = {
        candidate: obj.candidate.trim(),
      };
      if (obj.sdpMid !== undefined && obj.sdpMid !== null) cand.sdpMid = String(obj.sdpMid);
      if (obj.sdpMLineIndex !== undefined && obj.sdpMLineIndex !== null) cand.sdpMLineIndex = Number(obj.sdpMLineIndex);
      if (obj.usernameFragment) cand.usernameFragment = String(obj.usernameFragment);
      if (cand.sdpMid === undefined && cand.sdpMLineIndex === undefined) {
        cand.sdpMLineIndex = 0;
      }
      return cand;
    }

    function candKey(c: RTCIceCandidateInit) {
      return `${c.candidate}|${c.sdpMid}|${c.sdpMLineIndex}`;
    }

    async function addCand(pc: RTCPeerConnection, raw: any) {
      const norm = normalizeCand(raw);
      if (!norm) return;
      const key = candKey(norm);
      if (addedKeys.has(key)) return;

      if (pc.remoteDescription?.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(norm));
          addedKeys.add(key);
        } catch (e) {
          console.warn("[ICE] addIceCandidate error:", e);
        }
      } else {
        if (!candQueue.some((c) => candKey(c) === key)) candQueue.push(norm);
      }
    }

    async function flushQueue(pc: RTCPeerConnection) {
      if (!pc.remoteDescription?.type) return;
      while (candQueue.length > 0) {
        const c = candQueue.shift()!;
        const key = candKey(c);
        if (!addedKeys.has(key)) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
            addedKeys.add(key);
          } catch (e) {
            console.warn("[ICE] flush error:", e);
          }
        }
      }
    }

    // ── Apply Remote Offer (Receiver) ───────────────────────────────────────
    async function applyOffer(pc: RTCPeerConnection, rawOffer: any) {
      if (processed.offer || isSettingOffer || pc.signalingState === "closed") return;
      isSettingOffer = true;
      try {
        let offerObj = rawOffer;
        if (typeof rawOffer === "string") {
          try { offerObj = JSON.parse(rawOffer); } catch {}
        }
        if (!offerObj || !offerObj.sdp) {
          isSettingOffer = false;
          return;
        }

        console.log("[WebRTC] Receiver: applying remote offer, state:", pc.signalingState);
        if (pc.signalingState === "stable" || pc.signalingState === "have-remote-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(offerObj));
          processed.offer = true;
          await flushQueue(pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          applySenderBitrates(pc, callType === "video");
          console.log("[WebRTC] Receiver: sending answer to signal endpoint");
          await fetch("/api/calls/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "answer",
              callId,
              answer: { type: "answer", sdp: ans.sdp },
            }),
            keepalive: true,
          });
          if (isMountedRef.current) setStatus("connected");
        }
      } catch (e) {
        console.error("[WebRTC] applyOffer error:", e);
        if (pc.signalingState === "stable") {
          processed.offer = false;
        }
      } finally {
        isSettingOffer = false;
      }
    }

    // ── Apply Remote Answer (Caller) ────────────────────────────────────────
    async function applyAnswer(pc: RTCPeerConnection, rawAnswer: any) {
      if (processed.answer || isSettingAnswer || pc.signalingState === "closed") return;
      let answerObj = rawAnswer;
      if (typeof rawAnswer === "string") {
        try { answerObj = JSON.parse(rawAnswer); } catch {}
      }
      if (!answerObj || !answerObj.sdp) return;

      if (pc.signalingState !== "have-local-offer") {
        console.log("[WebRTC] Caller: buffering answer, state is", pc.signalingState);
        pendingRemoteAnswer = answerObj;
        return;
      }

      isSettingAnswer = true;
      try {
        console.log("[WebRTC] Caller: setting remote answer");
        await pc.setRemoteDescription(new RTCSessionDescription(answerObj));
        processed.answer = true;
        pendingRemoteAnswer = null;
        await flushQueue(pc);
        applySenderBitrates(pc, callType === "video");
        if (isMountedRef.current) setStatus("connected");
        console.log("[WebRTC] Caller: connection successfully established!");
      } catch (e) {
        console.error("[WebRTC] applyAnswer error:", e);
        if (pc.signalingState === "have-local-offer") {
          processed.answer = false;
        }
      } finally {
        isSettingAnswer = false;
      }
    }

    // ── ICE restart ─────────────────────────────────────────────────────────
    async function triggerIceRestart(pc: RTCPeerConnection) {
      if (!isCaller || pc.signalingState === "closed") return;
      try {
        if (typeof pc.restartIce === "function") pc.restartIce();
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await fetch("/api/calls/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_offer", callId, offer: { type: "offer", sdp: offer.sdp } }),
          keepalive: true,
        });
      } catch (e) {
        console.warn("[ICE] restart failed:", e);
      }
    }

    // ── Signal processor ────────────────────────────────────────────────────
    async function processSignal(pc: RTCPeerConnection, call: any) {
      if (!call || !isMountedRef.current || pc.signalingState === "closed") return;
      if (call.callId && call.callId !== callId) return;

      if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
        notificationService.stopRingtone();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        pcRef.current?.close();
        onEndCallRef.current?.();
        return;
      }

      // If receiver answered or accepted, transition caller out of "ringing" immediately
      if (isCaller && (call.status === "accepted" || call.answer)) {
        if (isMountedRef.current && statusRef.current === "ringing") {
          setStatus("connecting");
        }
      }

      // Receiver: receive offer
      if (!isCaller && call.offer && !processed.offer) {
        await applyOffer(pc, call.offer);
      }

      // Caller: receive answer
      if (isCaller && call.answer && !processed.answer) {
        await applyAnswer(pc, call.answer);
      }

      // Apply remote ICE candidates
      const cands: any[] = isCaller ? (call.receiverCandidates || []) : (call.callerCandidates || []);
      for (const c of cands) {
        await addCand(pc, c);
      }

      // Reactions
      if (call.lastReaction && Date.now() - call.lastReaction.timestamp < 1500) {
        onHeartRef.current?.();
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 2000);
      }
    }

    // ── Start ────────────────────────────────────────────────────────────────
    async function start() {
      // 1. Get user media
      let stream: MediaStream;
      let gotVideo = callType === "video";
      try {
        stream = await getUserMediaStream(callType === "video", true, "user");
        if (callType === "video" && stream.getVideoTracks().length === 0) {
          gotVideo = false;
          if (isMountedRef.current) setStatus("no_camera");
        }
      } catch (err) {
        console.error("[WebRTC] getUserMedia failed:", err);
        if (isMountedRef.current) setStatus("error");
        return;
      }
      if (!isMountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      localStreamRef.current = stream;

      // Attach local video
      if (localVideoRef.current && gotVideo) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // 2. Build RTCPeerConnection
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Add all tracks
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // 3. Handle remote tracks
      pc.ontrack = (ev) => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] ontrack:", ev.track.kind);

        let rs = remoteStreamRef.current;
        if (!rs) { rs = new MediaStream(); remoteStreamRef.current = rs; }

        // Prefer ev.streams[0] which is the canonical MediaStream
        if (ev.streams && ev.streams[0]) {
          const inbound = ev.streams[0];
          remoteStreamRef.current = inbound;
          attachRemoteStream(inbound);
        } else {
          if (!rs.getTracks().some((t) => t.id === ev.track.id)) rs.addTrack(ev.track);
          attachRemoteStream(rs);
        }

        // Watch for unmute (happens after ICE completes)
        ev.track.onunmute = () => {
          if (!isMountedRef.current) return;
          setHasRemoteVideo(true);
          if (isMountedRef.current) setStatus("connected");
          remoteVideoRef.current?.play().catch(() => {});
        };
      };

      // 4. Connection state tracking
      pc.onconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] connectionState:", pc.connectionState);
        switch (pc.connectionState) {
          case "connected":
            applySenderBitrates(pc, callType === "video");
            if (isMountedRef.current) setStatus("connected");
            if (remoteStreamRef.current) attachRemoteStream(remoteStreamRef.current);
            break;
          case "failed":
          case "disconnected":
            triggerIceRestart(pc);
            break;
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (!isMountedRef.current) return;
        console.log("[WebRTC] iceConnectionState:", pc.iceConnectionState);
        switch (pc.iceConnectionState) {
          case "connected":
          case "completed":
            applySenderBitrates(pc, callType === "video");
            if (isMountedRef.current) setStatus("connected");
            if (remoteStreamRef.current) attachRemoteStream(remoteStreamRef.current);
            break;
          case "failed":
            triggerIceRestart(pc);
            break;
        }
      };

      // 5. Send ICE candidates
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
            keepalive: true,
          });
        } catch {}
      };

      // 6. Caller creates offer and sends both in initiate AND set_offer for 100% reliability
      if (isCaller) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === "video",
          });
          await pc.setLocalDescription(offer);
          const offerPayload = { type: "offer", sdp: offer.sdp };
          console.log("[WebRTC] Caller: sending offer via set_offer");

          // Check if answer already arrived while offer was being created
          if (pendingRemoteAnswer && !processed.answer && pc.signalingState === "have-local-offer") {
            await applyAnswer(pc, pendingRemoteAnswer);
          }

          // Primary: set_offer (triggers SSE broadcast to receiver)
          await fetch("/api/calls/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "set_offer", callId, offer: offerPayload }),
            keepalive: true,
          });
          // Redundant: also update initiate with offer embedded (catches DB-miss race)
          fetch("/api/calls/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "initiate", callId, callerUsername: myUsername, callerName: myUsername, receiverUsername: partnerUsername, type: callType, offer: offerPayload }),
            keepalive: true,
          }).catch(() => {});
        } catch (e) {
          console.error("[WebRTC] createOffer failed:", e);
        }
      }

      // 7. Fetch initial signal state
      try {
        const r = await fetch(`/api/calls/signal?callId=${callId}`);
        if (r.ok) {
          const d = await r.json();
          if (d.call && pcRef.current) await processSignal(pcRef.current, d.call);
        }
      } catch {}

      // 8. SSE real-time stream
      try {
        const es = new EventSource(`/api/calls/stream?callId=${callId}&username=${myUsername}`);
        esRef.current = es;

        es.addEventListener("call_update", (e) => {
          try {
            const data = JSON.parse((e as MessageEvent).data);
            if (pcRef.current && pcReady) {
              processSignal(pcRef.current, data);
            } else {
              // Buffer signals that arrive before pc is ready
              pendingSignals.push(data);
            }
          } catch {}
        });

        es.addEventListener("candidate", (e) => {
          try {
            const d = JSON.parse((e as MessageEvent).data);
            if (d.isCaller !== isCaller) {
              if (pcRef.current && pcReady) {
                addCand(pcRef.current, d.candidate);
              } else {
                // Queue as a synthetic signal with just the candidate
                pendingSignals.push({ callerCandidates: isCaller ? [] : [d.candidate], receiverCandidates: isCaller ? [d.candidate] : [] });
              }
            }
          } catch {}
        });

        es.addEventListener("message", (e) => {
          try {
            const msg = JSON.parse((e as MessageEvent).data);
            const senderUname = (msg.senderUsername || "").toLowerCase();
            if (senderUname === partnerUsername.toLowerCase()) {
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
              if (!showLiveChatRef.current) setUnreadChatCount((c) => c + 1);
              if (isLoveMessage(msg.content)) {
                setHeartBurst(true);
                setTimeout(() => setHeartBurst(false), 2000);
              }
            }
          } catch {}
        });

        es.onerror = () => {
          // SSE errors are handled gracefully; polling is the safety net
        };
      } catch {}

      // Mark pc as ready and flush any buffered SSE signals
      pcReady = true;
      for (const sig of pendingSignals.splice(0)) {
        await processSignal(pc, sig);
      }

      // 9. Adaptive polling loop (fast until connected, slow after)
      const poll = async () => {
        if (!isMountedRef.current) return;
        try {
          const r = await fetch(`/api/calls/signal?callId=${callId}`);
          if (r.ok) {
            const d = await r.json();
            if (d.call && pcRef.current && isMountedRef.current) {
              await processSignal(pcRef.current, d.call);
            }
          }
        } catch {}
        if (!isMountedRef.current) return;
        const isConn =
          pcRef.current?.connectionState === "connected" ||
          pcRef.current?.iceConnectionState === "connected" ||
          pcRef.current?.iceConnectionState === "completed";
        pollRef.current = setTimeout(poll, isConn ? 2000 : 150);
      };
      pollRef.current = setTimeout(poll, 50); // Start polling immediately
    }

    start();

    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
      if (esRef.current)   esRef.current.close();
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // Auto-hide UI when connected on video call
  useEffect(() => {
    if (status === "connected" && callType === "video") revealUI();
    else setShowUI(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, callType]);

  // Duration timer
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => { durationRef.current += 1; setDuration((d) => d + 1); }, 1000);
    return () => clearInterval(t);
  }, [status]);

  // Fetch recent in-call messages
  useEffect(() => {
    let active = true;
    async function fetch_() {
      try {
        const res = await fetch(
          `/api/messages?myUsername=${encodeURIComponent(myUsername)}&partnerUsername=${encodeURIComponent(partnerUsername)}`
        );
        if (res.ok && active) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            setLiveMessages(
              data.messages.slice(-30).map((m: any) => ({
                id: m.id || String(m._id || Math.random()),
                senderUsername: m.senderUsername,
                senderName: m.senderName || m.senderUsername,
                senderAvatar: m.senderAvatar,
                content: m.content,
                createdAt: m.createdAt,
                isMine: m.senderUsername?.toLowerCase() === myUsername?.toLowerCase(),
              }))
            );
          }
        }
      } catch {}
    }
    if (myUsername && partnerUsername) fetch_();
    return () => { active = false; };
  }, [myUsername, partnerUsername]);

  // Auto-scroll comments
  useEffect(() => {
    if (showLiveChat) commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveMessages, showLiveChat]);

  // ── Action handlers ──────────────────────────────────────────────────────
  const toggleLiveChat = () => {
    setShowLiveChat((prev) => { if (!prev) setUnreadChatCount(0); return !prev; });
    revealUI();
  };

  const sendLiveComment = async (customText?: string) => {
    const text = (customText !== undefined ? customText : inCallText).trim();
    if (!text) return;
    setInCallText("");
    const tempId = "live_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    setLiveMessages((prev) => [
      ...prev.slice(-40),
      { id: tempId, senderUsername: myUsername, senderName: myName, senderAvatar: myAvatar, content: text, createdAt: new Date().toISOString(), isMine: true },
    ]);
    soundFX.playPop();
    if (isLoveMessage(text)) { setHeartBurst(true); setTimeout(() => setHeartBurst(false), 2000); sendHeart(); }
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderUsername: myUsername, senderName: myName, senderAvatar: myAvatar, receiverUsername: partnerUsername, type: "text", content: text }),
      });
    } catch {}
  };

  const flipCamera = async () => {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    const next = facingModeRef.current === "user" ? "environment" : "user";
    setFacingMode(next);
    try {
      const ns = await getUserMediaStream(true, false, next);
      const nv = ns.getVideoTracks()[0];
      if (!nv) return;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(nv);
      stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
      stream.addTrack(nv);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch {}
  };

  const toggleMic = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMicMuted(!t.enabled); }
  };

  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsVideoOff(!t.enabled); }
  };

  const toggleSpeaker = () => {
    const a = remoteAudioRef.current;
    const next = !isSpeakerOff;
    if (a) a.muted = next;
    setIsSpeakerOff(next);
  };

  const sendHeart = async () => {
    onTriggerFloatingHeart?.();
    soundFX.playLovePing();
    setHeartBurst(true);
    triggerFloatingEmoji("💖");
    setTimeout(() => setHeartBurst(false), 2000);
    try {
      await fetch("/api/calls/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reaction", callId, emoji: "💖" }),
      });
    } catch {}
  };

  const triggerFloatingEmoji = (emoji: string) => {
    const id = "react_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const left = 65 + Math.random() * 25; // 65% to 90% from left
    setFloatingReactions((prev) => [...prev.slice(-15), { id, emoji, left }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2200);
  };

  const handleScreenClick = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // Double click/tap anywhere on screen sends romantic heart!
      sendHeart();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      revealUI();
    }
  };

  const cyclePipCorner = (e: React.MouseEvent) => {
    e.stopPropagation();
    const corners: Array<"top-right" | "top-left" | "bottom-right" | "bottom-left"> = [
      "top-right", "bottom-right", "bottom-left", "top-left"
    ];
    const currentIndex = corners.indexOf(pipCorner);
    setPipCorner(corners[(currentIndex + 1) % corners.length]);
  };

  const endCall = () => {
    notificationService.stopRingtone();
    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "end",
        callId,
        durationSeconds: durationRef.current,
        callerUsername: isCaller ? myUsername : partnerUsername,
        receiverUsername: isCaller ? partnerUsername : myUsername,
      }),
      keepalive: true,
    }).catch(() => {});
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    onEndCall();
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const avatar = partnerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUsername}`;

  // Compute PiP placement styles
  const pipStyles: Record<string, string> = {
    "top-right": "top-16 right-4 sm:top-20 sm:right-6",
    "top-left": "top-16 left-4 sm:top-20 sm:left-6",
    "bottom-right": "bottom-36 right-4 sm:bottom-40 sm:right-6",
    "bottom-left": "bottom-36 left-4 sm:bottom-40 left-6",
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[8000] bg-black flex flex-col select-none overflow-hidden"
      style={{ height: "100dvh" }}
      onClick={handleScreenClick}
    >
      {/* Hidden audio element – plays remote audio on all call types */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* ── Full-screen Main Video ───────────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden bg-zinc-950 flex items-center justify-center">
        {callType === "video" && (
          <>
            {/* Blurred ambient background when in fit mode */}
            {isFitMode && hasRemoteVideo && (
              <div
                className="absolute inset-0 opacity-40 blur-2xl scale-110 pointer-events-none"
                style={{
                  backgroundImage: `url(${avatar})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}

            {/* Main Video element */}
            <video
              ref={(el) => {
                const target = isSwapped ? localVideoRef : remoteVideoRef;
                target.current = el;
                const stream = isSwapped ? localStreamRef.current : remoteStreamRef.current;
                if (el && stream && el.srcObject !== stream) {
                  el.srcObject = stream;
                  el.play().catch(() => { if (el) { el.muted = true; el.play().catch(() => {}); } });
                }
              }}
              autoPlay
              playsInline
              muted={isSwapped}
              onLoadedMetadata={() => { setHasRemoteVideo(true); setStatus("connected"); remoteVideoRef.current?.play().catch(() => {}); }}
              onCanPlay={() => { setHasRemoteVideo(true); setStatus("connected"); remoteVideoRef.current?.play().catch(() => {}); }}
              onPlay={() => { setHasRemoteVideo(true); setStatus("connected"); }}
              className={`w-full h-full transition-all duration-300 ${
                isFitMode ? "object-contain" : "object-cover"
              } ${isSwapped ? "scale-x-[-1]" : ""} ${hasRemoteVideo || isSwapped ? "opacity-100" : "opacity-0"}`}
            />
          </>
        )}

        {/* Connecting / audio overlay */}
        {(!hasRemoteVideo || callType === "audio") && !isSwapped && (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center mb-8">
              {status !== "error" && (
                <>
                  <div className="absolute w-48 h-48 rounded-full bg-usly-pink/15 animate-ping" style={{ animationDuration: "2.5s" }} />
                  <div className="absolute w-36 h-36 rounded-full bg-usly-pink/25 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.7s" }} />
                </>
              )}
              <div className="relative w-32 h-32 rounded-full overflow-hidden shadow-2xl ring-4 ring-usly-pink/40">
                <img src={avatar} alt={partnerName} className="w-full h-full object-cover" />
              </div>
            </div>
            <p className="text-white text-2xl font-bold mb-2 tracking-tight">{partnerName}</p>
            <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white/80 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {status === "error"
                  ? "🚫 Camera / microphone blocked"
                  : status === "no_camera"
                  ? "Voice call (Camera not available)"
                  : status === "ringing"
                  ? "Ringing your love…"
                  : status === "connected" && callType === "audio"
                  ? `In Call • ${fmt(duration)}`
                  : "Connecting HD Video…"}
              </span>
            </div>
          </div>
        )}

        {/* Subtle Vignettes for top and bottom controls */}
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none" />
      </div>

      {/* ── Self / Secondary Picture-in-Picture (PiP) ────────────────────────── */}
      {callType === "video" && (
        <div
          className={`absolute ${pipStyles[pipCorner] || pipStyles["top-right"]} z-30 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/30 bg-zinc-900/90 backdrop-blur-md transition-all duration-300 cursor-pointer active:scale-95 group hover:ring-usly-pink`}
          style={{ width: 104, height: 156 }}
          onClick={(e) => {
            e.stopPropagation();
            setIsSwapped(!isSwapped);
          }}
          title="Click to swap view • Double click corner button to move"
        >
          <video
            ref={(el) => {
              const target = isSwapped ? remoteVideoRef : localVideoRef;
              target.current = el;
              const stream = isSwapped ? remoteStreamRef.current : localStreamRef.current;
              if (el && stream && el.srcObject !== stream) {
                el.srcObject = stream;
                el.play().catch(() => {});
              }
            }}
            autoPlay playsInline muted={!isSwapped}
            className={`w-full h-full object-cover ${!isSwapped ? "scale-x-[-1]" : ""} ${
              (!isSwapped && isVideoOff) ? "opacity-0" : "opacity-100"
            }`}
          />
          {!isSwapped && isVideoOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white/50">
              <VideoOff className="w-6 h-6 mb-1 text-zinc-400" />
              <span className="text-[10px] font-bold">Cam Off</span>
            </div>
          )}

          {/* Move corner trigger button */}
          <button
            onClick={cyclePipCorner}
            title="Move picture-in-picture position"
            className="absolute top-1 left-1 bg-black/60 backdrop-blur-md rounded-full p-1 opacity-70 group-hover:opacity-100 transition hover:bg-black/90 text-white"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
          </button>

          {/* Flip camera on self-view */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              flipCamera();
            }}
            title="Switch front/back camera"
            className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md rounded-full p-1.5 opacity-80 group-hover:opacity-100 transition hover:bg-black/90 text-white"
          >
            <SwitchCamera className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* ── Top Bar with Status & Controls ─────────────────────────────────── */}
      <div className={`relative z-20 flex items-center justify-between px-4 sm:px-6 pt-10 sm:pt-12 transition-opacity duration-300 ${showUI || status !== "connected" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="flex items-center space-x-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-usly-pink/60 shadow-lg flex-shrink-0">
            <img src={avatar} alt={partnerName} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black" />
          </div>
          <div>
            <p className="text-white font-black text-sm sm:text-base leading-tight tracking-tight drop-shadow-md">{partnerName}</p>
            <div className="flex items-center space-x-2 text-[11px] text-white/80 leading-tight mt-0.5">
              {status === "connected" ? (
                <>
                  <span className="flex items-center space-x-1 font-mono font-bold text-white">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    <span>{fmt(duration)}</span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold text-[9px]">
                    HD 1080p
                  </span>
                </>
              ) : status === "ringing" ? (
                <span className="text-pink-300 font-medium animate-pulse">Ringing…</span>
              ) : (
                <span className="text-zinc-300">Connecting…</span>
              )}
            </div>
          </div>
        </div>

        {/* Top Right Action Pills */}
        <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
          {/* P2P Encrypted Badge */}
          <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] text-white/70">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>P2P Encrypted</span>
          </div>

          {/* Aspect Ratio Mode (Fit vs Cover) */}
          {callType === "video" && (
            <button
              onClick={() => setIsFitMode(!isFitMode)}
              title={isFitMode ? "Switch to Fullscreen Fill" : "Switch to Fit Screen"}
              className="p-2 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-md border border-white/15 text-white/90 transition active:scale-95 shadow-lg flex items-center justify-center"
            >
              {isFitMode ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* ── Double-Tap Heart Burst Overlay ─────────────────────────────────── */}
      {heartBurst && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="text-9xl animate-ping" style={{ animationDuration: "1s" }}>💖</div>
        </div>
      )}

      {/* ── Floating Emojis Stream (Drifts upward smoothly) ────────────────── */}
      <div className="absolute inset-0 pointer-events-none z-35 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-28 text-3xl sm:text-4xl animate-float-up"
            style={{ left: `${r.left}%` }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* ── Live Chat Overlay ─────────────────────────────────────────────── */}
      {showLiveChat && status === "connected" && (
        <div
          className={`absolute bottom-36 sm:bottom-40 left-3 sm:left-5 z-25 flex flex-col pointer-events-auto transition-all duration-300 max-w-[85vw] sm:max-w-sm ${showUI || isInputFocused ? "opacity-100" : "opacity-85 hover:opacity-100"}`}
          style={{ maxHeight: 220 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="flex items-center space-x-1.5 bg-black/50 backdrop-blur-md border border-white/15 px-2.5 py-0.5 rounded-full text-[11px] text-white/90 font-medium shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
              <span>In-Call Live Chat</span>
            </div>
            <button onClick={() => setShowLiveChat(false)} className="text-[10px] text-white/70 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10 transition active:scale-95">
              Hide
            </button>
          </div>
          <div className="overflow-y-auto space-y-1.5 pr-1 scrollbar-none" style={{ maxHeight: 185, maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 100%)" }}>
            {liveMessages.length === 0 ? (
              <div className="text-[11px] text-white/60 italic px-2.5 py-1 bg-black/35 backdrop-blur-sm rounded-xl inline-block border border-white/5">No comments yet. Say something sweet... ✨</div>
            ) : (
              liveMessages.map((msg) => (
                <div key={msg.id} className="flex items-start space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <img src={msg.senderAvatar || (msg.isMine ? myAvatar : avatar)} alt={msg.senderName} className="w-6 h-6 rounded-full object-cover ring-1 ring-white/30 flex-shrink-0 mt-0.5" />
                  <div className={`rounded-2xl px-3 py-1.5 text-xs shadow-lg max-w-[85%] break-words border ${msg.isMine ? "bg-pink-950/70 border-pink-500/40 text-white backdrop-blur-md" : "bg-black/65 border-white/15 text-white backdrop-blur-md"}`}>
                    <span className="font-bold text-usly-coral mr-1.5">{msg.isMine ? "You" : msg.senderName}</span>
                    <span className="text-white/90">{msg.content}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>
        </div>
      )}

      {/* ── Bottom Controls ───────────────────────────────────────────────── */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 flex flex-col items-center pb-8 sm:pb-10 px-4 transition-opacity duration-300 ${showUI || callType === "audio" || isInputFocused || status !== "connected" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        {/* Quick Romantic Love Ping Trigger */}
        {(!showLiveChat || status !== "connected") && (
          <button
            onClick={(e) => { e.stopPropagation(); sendHeart(); }}
            className="mb-4 flex items-center space-x-2 px-6 py-2.5 rounded-full bg-gradient-love text-white text-sm font-bold active:scale-95 transition shadow-xl shadow-usly-pink/30 hover:opacity-95"
          >
            <Heart className="w-4 h-4 fill-white text-white animate-pulse" />
            <span>Send Love 💖</span>
          </button>
        )}

        {showLiveChat && status === "connected" && (
          <form
            onSubmit={(e) => { e.preventDefault(); sendLiveComment(); }}
            className="flex items-center space-x-1.5 sm:space-x-2 w-full max-w-sm mb-3 px-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 flex items-center bg-black/65 backdrop-blur-xl border border-white/20 rounded-full px-3.5 py-1.5 sm:py-2 shadow-xl focus-within:border-pink-500/80 transition">
              <input
                type="text"
                value={inCallText}
                onChange={(e) => setInCallText(e.target.value)}
                onFocus={() => { setIsInputFocused(true); setShowUI(true); }}
                onBlur={() => setIsInputFocused(false)}
                placeholder={`Comment as ${myUsername}...`}
                className="w-full bg-transparent text-white placeholder-white/50 text-xs sm:text-sm outline-none pr-1"
              />
              {inCallText.trim() && (
                <button type="submit" className="ml-1 p-1 rounded-full bg-pink-500 hover:bg-pink-600 text-white transition active:scale-95 flex-shrink-0 shadow-md">
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {["❤️", "😂", "🔥", "💖", "💋"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    sendLiveComment(emoji);
                    triggerFloatingEmoji(emoji);
                  }}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/15 flex items-center justify-center text-xs sm:text-sm active:scale-90 transition hover:scale-110 shadow-sm"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </form>
        )}

        {/* Main Floating Glass Action Bar */}
        <div
          className="w-full max-w-sm flex items-center justify-around bg-black/60 backdrop-blur-2xl border border-white/20 rounded-full px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mute Mic */}
          <button
            onClick={toggleMic}
            title={isMicMuted ? "Unmute Microphone" : "Mute Microphone"}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${isMicMuted ? "bg-red-500 shadow-lg shadow-red-500/40 text-white" : "bg-white/15 text-white hover:bg-white/25"}`}
          >
            {isMicMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>

          {/* Toggle Video or Speaker */}
          {callType === "video" ? (
            <button
              onClick={toggleVideo}
              title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${isVideoOff ? "bg-red-500 shadow-lg shadow-red-500/40 text-white" : "bg-white/15 text-white hover:bg-white/25"}`}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          ) : (
            <button
              onClick={toggleSpeaker}
              title={isSpeakerOff ? "Unmute Speaker" : "Mute Speaker"}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${isSpeakerOff ? "bg-red-500 text-white" : "bg-white/15 text-white hover:bg-white/25"}`}
            >
              {isSpeakerOff ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          )}

          {/* Live Chat Drawer */}
          <button
            onClick={toggleLiveChat}
            title="Toggle Live Chat"
            className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition active:scale-90 ${showLiveChat ? "bg-pink-500 text-white shadow-lg shadow-pink-500/40 border border-pink-400/50" : "bg-white/15 text-white hover:bg-white/25"}`}
          >
            <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            {!showLiveChat && unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold bg-pink-500 text-white rounded-full ring-2 ring-black shadow animate-bounce">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </button>

          {/* Camera Flip */}
          {callType === "video" && (
            <button
              onClick={flipCamera}
              title="Flip Camera"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition active:scale-90"
            >
              <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          {/* Hang Up Button */}
          <button
            onClick={endCall}
            title="End Call"
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-red-600 hover:bg-red-700 active:scale-90 text-white flex items-center justify-center transition shadow-2xl shadow-red-600/50"
          >
            <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(0.8) rotate(0deg); }
          50% { transform: translateY(-120px) scale(1.2) rotate(15deg); }
          100% { opacity: 0; transform: translateY(-240px) scale(1.4) rotate(-15deg); }
        }
        .animate-float-up {
          animation: floatUp 2.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  );
}
