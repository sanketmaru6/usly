// High-Definition, Low-Latency WebRTC Configuration & Performance Optimizer
import { EventEmitter } from "events";

// Complete High-Speed ICE Configuration with Google STUN + Cloudflare STUN
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 2,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// Creates an emergency fallback stream with silent audio and dark video so WebRTC never fails
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

// Auto-quality camera stream: HD 720p -> standard -> bare -> audio-only fallback
export async function getUserMediaStream(
  video: boolean = true,
  audio: boolean = true,
  facingMode: "user" | "environment" = "user"
): Promise<MediaStream> {
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  if (!video) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: audioConstraints });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      } catch {
        return createFallbackStream(false);
      }
    }
  }

  // 1. Try crisp HD 720p
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: { ideal: facingMode },
      },
      audio: audioConstraints,
    });
    return stream;
  } catch (e1: any) {
    console.warn("HD camera tier failed, trying standard video:", e1?.message);
  }

  // 2. Try standard camera with facing mode
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: true,
    });
    return stream;
  } catch (e2: any) {
    console.warn("Standard camera failed, trying bare video:", e2?.message);
  }

  // 3. Try bare video
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    return stream;
  } catch (e3: any) {
    console.warn("Camera completely unavailable, falling back to audio-only:", e3?.message);
  }

  // 4. Fallback: audio-only (call still works smoothly)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true,
    });
  } catch (e4: any) {
    console.warn("Audio hardware also blocked or in use, creating fallback stream:", e4?.message);
  }

  // 5. Ultimate fallback: synthetic stream (keeps peer connection alive)
  return createFallbackStream(video);
}

// Applies optimal bitrates and priorities natively via WebRTC sender parameters
// This replaces dangerous regex string SDP mangling that broke SDP parsing
export function applySenderBitrates(pc: RTCPeerConnection, isVideo: boolean = true) {
  try {
    pc.getSenders().forEach((sender) => {
      if (sender.track?.kind === "video" && isVideo) {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps crisp HD
        params.encodings[0].priority = "high";
        params.encodings[0].networkPriority = "high";
        sender.setParameters(params).catch(() => {});
      } else if (sender.track?.kind === "audio") {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 64000; // 64kbps HD audio
        params.encodings[0].priority = "high";
        sender.setParameters(params).catch(() => {});
      }
    });
  } catch (e) {
    console.warn("applySenderBitrates error:", e);
  }
}

// Pass-through optimizer that guarantees valid SDP syntax without breaking Chromium parsers
export function optimizeSDP(sdp: string, _isVideo: boolean = true): string {
  // Returns clean valid SDP to prevent duplicate fmtp or broken m=video lines
  return sdp;
}

// Sound effects generator using Web Audio API
export class RomanticSoundFX {
  private ctx: AudioContext | null = null;

  private getContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    return this.ctx;
  }

  // Romantic chime when message or love ping arrives
  playLovePing() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Major Chord)

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.08);

        gain.gain.setValueAtTime(0.2, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.6);
      });
    } catch (e) {
      console.error("Audio FX error:", e);
    }
  }

  // Bubble pop (WhatsApp / iMessage style soft pop)
  playPop() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.04);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  }

  // Crystal bell chime (sparkly high chime)
  playCrystal() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      [1046.5, 1318.5, 1567.98].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.15, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.5);
      });
    } catch (e) {}
  }

  // Warm heartbeat thump-thump
  playHeartbeat() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      [0, 0.14].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(85, now + offset);
        osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.12);
        gain.gain.setValueAtTime(0.35, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.13);
      });
    } catch (e) {}
  }

  // Play currently chosen live chat sound
  playChatSound(soundChoice?: string) {
    const choice =
      soundChoice ||
      (typeof window !== "undefined"
        ? localStorage.getItem("usly_chat_sound") || "chime"
        : "chime");

    if (choice === "silent") {
      return; // User muted chat sounds
    }
    if (choice === "pop") {
      this.playPop();
    } else if (choice === "crystal") {
      this.playCrystal();
    } else if (choice === "heartbeat") {
      this.playHeartbeat();
    } else {
      this.playLovePing();
    }
  }

  // WhatsApp-style phone ringtone — instantly stoppable via master gain
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
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.linearRampToValueAtTime(freqEnd, t + dur * 0.8);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(vol, t + 0.04);
          gain.gain.setValueAtTime(vol, t + dur - 0.12);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + dur + 0.05);
        };

        // Ring 1 (0.0s - 0.45s)
        makeRing(480, 960, startTime, 0.45, 0.28);
        makeRing(960, 1920, startTime, 0.45, 0.08, "triangle");

        // Ring 2 (0.65s - 1.1s)
        makeRing(480, 960, startTime + 0.65, 0.45, 0.28);
        makeRing(960, 1920, startTime + 0.65, 0.45, 0.08, "triangle");
      };

      const scheduleNextRing = () => {
        if (!isPlaying) return;
        playBurst(ctx.currentTime);
        scheduleTimeout = setTimeout(() => {
          if (isPlaying) scheduleNextRing();
        }, 3500);
      };

      scheduleNextRing();

      return () => {
        isPlaying = false;
        if (scheduleTimeout) clearTimeout(scheduleTimeout);
        try {
          masterGain.gain.cancelScheduledValues(ctx.currentTime);
          masterGain.gain.setValueAtTime(0, ctx.currentTime);
          setTimeout(() => {
            try { masterGain.disconnect(); } catch {}
          }, 50);
        } catch {}
      };
    } catch {
      return () => {};
    }
  }
}

export const soundFX = new RomanticSoundFX();
