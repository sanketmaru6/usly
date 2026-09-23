"use client";

import React, { useEffect, useState, useRef, memo } from "react";
import { Phone, PhoneOff, Video, Heart, Lock } from "lucide-react";
import { notificationService } from "@/lib/notifications";

interface IncomingCallAlertProps {
  callerName: string;
  callerUsername: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallAlert = memo(function IncomingCallAlert({
  callerName,
  callerUsername,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}: IncomingCallAlertProps) {
  // Exactly 60 seconds (1 full minute) ringing timer
  const [countdown, setCountdown] = useState(60);
  const avatarSrc = callerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerUsername}`;

  const onDeclineRef = useRef(onDecline);
  useEffect(() => {
    onDeclineRef.current = onDecline;
  });

  const onAcceptRef = useRef(onAccept);
  useEffect(() => {
    onAcceptRef.current = onAccept;
  });

  // Stable 60-second countdown
  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(iv);
          notificationService.stopRingtone();
          onDeclineRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(iv);
      notificationService.stopRingtone();
    };
  }, []);

  const handleAccept = () => {
    notificationService.stopRingtone();
    onAcceptRef.current();
  };

  const handleDecline = () => {
    notificationService.stopRingtone();
    onDeclineRef.current();
  };

  return (
    <div
      className="fixed inset-0 z-[9500] flex flex-col justify-between select-none overflow-hidden bg-zinc-950"
      style={{ height: "100dvh" }}
    >
      {/* ── Background: Smooth Blurred Caller Avatar with subtle dark overlay ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={avatarSrc}
          alt=""
          className="w-full h-full object-cover scale-125 opacity-30 filter blur-3xl transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/90" />
      </div>

      {/* ── Top Section: Call Type & Encryption Badge ── */}
      <div className="relative z-10 pt-12 sm:pt-16 px-6 flex flex-col items-center text-center space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white/90 text-xs font-semibold shadow-lg">
          {callType === "video" ? (
            <Video className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>Incoming {callType === "video" ? "HD Video" : "Voice"} Call</span>
        </div>

        <div className="flex items-center space-x-1 text-[11px] text-white/60">
          <Lock className="w-3 h-3 text-emerald-400" />
          <span>End-to-End Encrypted</span>
        </div>
      </div>

      {/* ── Middle Section: Avatar, Caller Name, & Pulsing Love Heart ── */}
      <div className="relative z-10 flex flex-col items-center px-6 my-auto">
        {/* Glowing Caller Avatar with Stable Ripple Effect */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border-2 border-usly-pink/30 animate-ping" style={{ animationDuration: "2.8s" }} />
          <div className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border border-usly-pink/40 animate-ping" style={{ animationDuration: "2.8s", animationDelay: "0.9s" }} />

          <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden ring-4 ring-usly-pink/70 shadow-2xl shadow-usly-pink/30 bg-zinc-900">
            <img src={avatarSrc} alt={callerName} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Caller Info */}
        <h1 className="text-2xl sm:text-3xl font-black text-white text-center tracking-tight mb-1">
          {callerName}
        </h1>
        <p className="text-usly-coral/90 text-xs sm:text-sm font-mono text-center mb-3">
          @{callerUsername}
        </p>

        {/* Continuous Ringing Pill (Solid, non-blinking) */}
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-usly-pink/15 border border-usly-pink/30 text-white text-xs shadow-md">
          <Heart className="w-3.5 h-3.5 fill-usly-pink text-usly-pink animate-pulse" />
          <span className="font-medium text-pink-200">
            {callType === "video" ? "Calling your video..." : "Calling your phone..."}
          </span>
          <span className="font-mono text-[11px] text-white/70 pl-1 border-l border-white/20">
            {countdown}s
          </span>
        </div>
      </div>

      {/* ── Bottom Section: Touch-Friendly Mobile Accept / Decline Buttons ── */}
      <div className="relative z-10 pb-12 sm:pb-16 px-8 sm:px-16 w-full max-w-md mx-auto">
        <div className="flex items-center justify-around">
          {/* Decline Button */}
          <div className="flex flex-col items-center space-y-2">
            <button
              onClick={handleDecline}
              title="Decline Call"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 active:bg-red-700 active:scale-90 text-white flex items-center justify-center shadow-2xl shadow-red-600/50 transition duration-150"
            >
              <PhoneOff className="w-7 h-7 sm:w-9 sm:h-9" />
            </button>
            <span className="text-white/80 text-xs sm:text-sm font-bold tracking-wide">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center space-y-2">
            <button
              onClick={handleAccept}
              title="Accept Call"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500 active:bg-emerald-600 active:scale-90 text-white flex items-center justify-center shadow-2xl shadow-emerald-500/50 transition duration-150 animate-bounce"
              style={{ animationDuration: "1.8s" }}
            >
              {callType === "video" ? (
                <Video className="w-7 h-7 sm:w-9 sm:h-9" />
              ) : (
                <Phone className="w-7 h-7 sm:w-9 sm:h-9" />
              )}
            </button>
            <span className="text-white font-bold text-xs sm:text-sm tracking-wide text-emerald-400">
              {callType === "video" ? "Accept Video" : "Answer"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default IncomingCallAlert;
