// High-Definition, Low-Latency WebRTC Configuration & Performance Optimizer
import { EventEmitter } from "events";

// ─── ICE Configuration ───────────────────────────────────────────────────────
// Strategy: Multiple STUN + multiple TURN providers for maximum reliability.
// If two peers are on the same LAN/WiFi, STUN alone works.
// For mobile 4G / strict NAT / firewall, TURN relay is mandatory.
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // ── STUN servers (no auth needed) ────────────────────────────────────────
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.ekiga.net:3478" },
    { urls: "stun:stun.ideasip.com:3478" },
    // ── TURN servers (relay through strict NAT, mobile data) ─────────────────
    // openrelay.metered.ca — free public relay (no API key required)
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // numb.viagenie.ca — free TURN
    {
      urls: "turn:numb.viagenie.ca",
      username: "webrtc@live.com",
      credential: "muazkh",
    },
    // relay.webwormhole.io — another free relay
    {
      urls: "turn:relay.webwormhole.io:443?transport=tcp",
      username: "foo",
      credential: "bar",
    },
  ],
  iceCandidatePoolSize: 10,
  // "all" = try both STUN + TURN; use "relay" only if STUN fails too
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// ─── Fallback stream (keeps peer connection alive even without camera) ───────
export function createFallbackStream(video: boolean = true): MediaStream {
  const stream = new MediaStream();
  if (typeof window !== "undefined") {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();
        dst.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch {}

    if (video && typeof document !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          ctx2d.fillStyle = "#18181b";
          ctx2d.fillRect(0, 0, 640, 480);
        }
        const canvasStream = (canvas as any).captureStream?.(10);
        if (canvasStream) {
          canvasStream.getVideoTracks().forEach((t: MediaStreamTrack) => stream.addTrack(t));
        }
      } catch {}
    }
  }
  return stream;
}

// ─── getUserMedia with graceful fallback chain ───────────────────────────────
export async function getUserMediaStream(
  video: boolean = true,
  audio: boolean = true,
  facingMode: "user" | "environment" = "user"
): Promise<MediaStream> {
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1,
  };

  if (!video) {
    try { return await navigator.mediaDevices.getUserMedia({ video: false, audio: audioConstraints }); } catch {}
    try { return await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); } catch {}
    return createFallbackStream(false);
  }

  // Tier 1 – HD 720p
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: { ideal: facingMode } },
      audio: audioConstraints,
    });
  } catch {}

  // Tier 2 – Standard 480p
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: { ideal: facingMode } },
      audio: audioConstraints,
    });
  } catch {}

  // Tier 3 – Any video
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch {}

  // Tier 4 – Audio only
  try {
    return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  } catch {}

  // Tier 5 – Synthetic fallback
  return createFallbackStream(video);
}

// ─── Codec preferences (call BEFORE setLocalDescription) ────────────────────
export function optimizeCodecs(pc: RTCPeerConnection) {
  try {
    if (typeof RTCRtpSender === "undefined" || typeof RTCRtpSender.getCapabilities !== "function") return;
    const caps = RTCRtpSender.getCapabilities("video");
    if (!caps?.codecs) return;
    const preferred = ["video/H264", "video/VP8", "video/VP9"];
    const sorted = [...caps.codecs].sort((a, b) => {
      const ai = preferred.indexOf(a.mimeType), bi = preferred.indexOf(b.mimeType);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
    pc.getTransceivers().forEach((tr) => {
      if ((tr.sender.track?.kind === "video" || tr.receiver.track?.kind === "video") &&
          typeof tr.setCodecPreferences === "function") {
        try { tr.setCodecPreferences(sorted); } catch {}
      }
    });
  } catch {}
}

// ─── Sender bitrate optimizer ────────────────────────────────────────────────
export function applySenderBitrates(pc: RTCPeerConnection, isVideo: boolean = true) {
  try {
    pc.getSenders().forEach((sender) => {
      if (sender.track?.kind === "video" && isVideo) {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = 1_200_000;   // 1.2 Mbps HD
        params.encodings[0].maxFramerate = 30;
        params.encodings[0].priority = "high";
        (params.encodings[0] as any).networkPriority = "high";
        sender.setParameters(params).catch(() => {});
      } else if (sender.track?.kind === "audio") {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = 64_000;       // 64 kbps Opus
        params.encodings[0].priority = "high";
        (params.encodings[0] as any).networkPriority = "high";
        sender.setParameters(params).catch(() => {});
      }
    });
  } catch {}
}

export function optimizeSDP(sdp: string): string { return sdp; }

// ─── Sound effects ───────────────────────────────────────────────────────────
export class RomanticSoundFX {
  private ctx: AudioContext | null = null;
  private getContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  }

  playLovePing() {
    try {
      const ctx = this.getContext(); if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.2, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.6);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.6);
      });
    } catch {}
  }

  playPop() {
    try {
      const ctx = this.getContext(); if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(320, now); osc.frequency.exponentialRampToValueAtTime(750, now + 0.04);
      gain.gain.setValueAtTime(0.28, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + 0.1);
    } catch {}
  }

  playCrystal() {
    try {
      const ctx = this.getContext(); if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [1046.5, 1318.5, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "triangle"; osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.15, now + i * 0.06); gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.45);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.5);
      });
    } catch {}
  }

  playHeartbeat() {
    try {
      const ctx = this.getContext(); if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      [0, 0.14].forEach((offset) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(85, now + offset); osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.12);
        gain.gain.setValueAtTime(0.35, now + offset); gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(now + offset); osc.stop(now + offset + 0.13);
      });
    } catch {}
  }

  playChatSound(soundChoice?: string) {
    const choice = soundChoice || (typeof window !== "undefined" ? localStorage.getItem("usly_chat_sound") || "chime" : "chime");
    if (choice === "silent") return;
    if (choice === "pop") this.playPop();
    else if (choice === "crystal") this.playCrystal();
    else if (choice === "heartbeat") this.playHeartbeat();
    else this.playLovePing();
  }

  playRingtone() {
    try {
      const ctx = this.getContext();
      if (!ctx) return () => {};
      if (ctx.state === "suspended") ctx.resume();

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1, ctx.currentTime);
      masterGain.connect(ctx.destination);

      let isPlaying = true;
      let scheduleTimeout: ReturnType<typeof setTimeout> | null = null;

      const playBurst = (startTime: number) => {
        if (!isPlaying) return;
        const makeRing = (freq: number, freqEnd: number, t: number, dur: number, vol: number, type: OscillatorType = "sine") => {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.linearRampToValueAtTime(freqEnd, t + dur * 0.8);
          gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(vol, t + 0.04);
          gain.gain.setValueAtTime(vol, t + dur - 0.12); gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain); gain.connect(masterGain); osc.start(t); osc.stop(t + dur + 0.05);
        };
        makeRing(480, 960, startTime, 0.45, 0.28);
        makeRing(960, 1920, startTime, 0.45, 0.08, "triangle");
        makeRing(480, 960, startTime + 0.65, 0.45, 0.28);
        makeRing(960, 1920, startTime + 0.65, 0.45, 0.08, "triangle");
      };

      const scheduleNextRing = () => {
        if (!isPlaying) return;
        playBurst(ctx.currentTime);
        scheduleTimeout = setTimeout(() => { if (isPlaying) scheduleNextRing(); }, 3500);
      };
      scheduleNextRing();

      return () => {
        isPlaying = false;
        if (scheduleTimeout) clearTimeout(scheduleTimeout);
        try {
          masterGain.gain.cancelScheduledValues(ctx.currentTime);
          masterGain.gain.setValueAtTime(0, ctx.currentTime);
          setTimeout(() => { try { masterGain.disconnect(); } catch {} }, 50);
        } catch {}
      };
    } catch {
      return () => {};
    }
  }
}

export const soundFX = new RomanticSoundFX();
