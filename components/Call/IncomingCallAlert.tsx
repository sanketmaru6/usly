"use client";

import React, { useEffect, useState } from "react";
import { Phone, PhoneOff, Video, Heart } from "lucide-react";

import { notificationService } from "@/lib/notifications";

interface IncomingCallAlertProps {
  callerName: string;
  callerUsername: string;
  callerAvatar?: string;
  callType: "audio" | "video";
  onAccept: () => void;
  onDecline: () => void;
}

export default function IncomingCallAlert({
  callerName,
  callerUsername,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
}: IncomingCallAlertProps) {
  const [countdown, setCountdown] = useState(40);
  const avatarSrc = callerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerUsername}`;

  // Countdown to auto-decline
  useEffect(() => {
    const iv = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => {
      clearInterval(iv);
      notificationService.stopRingtone();
    };
  }, []);

  // Auto-decline when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      notificationService.stopRingtone();
      onDecline();
    }
  }, [countdown, onDecline]);

  const handleAccept = () => {
    notificationService.stopRingtone();
    onAccept();
  };

  const handleDecline = () => {
    notificationService.stopRingtone();
    onDecline();
  };

  return (
    <div
      className="fixed inset-0 z-[9500] flex flex-col"
      style={{ height: "100dvh" }}
    >
      {/* Full-screen blurred background (WhatsApp uses caller's avatar blurred) */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={avatarSrc}
          alt=""
          className="w-full h-full object-cover scale-110"
          style={{ filter: "blur(40px) brightness(0.35) saturate(1.4)" }}
        />
        {/* Extra dark overlay */}
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-6">

        {/* Top label */}
        <div className="mt-16 mb-8 text-center">
          <p className="text-white/60 text-sm font-medium tracking-wide">
            Incoming {callType === "video" ? "Video" : "Voice"} Call
          </p>
        </div>

        {/* Caller avatar — large, centered, with ripple rings */}
        <div className="relative flex items-center justify-center mb-6">
          {/* Animated ripple rings */}
          <div className="absolute w-52 h-52 rounded-full border border-white/10 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="absolute w-44 h-44 rounded-full border border-white/15 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
          <div className="absolute w-36 h-36 rounded-full border border-white/20 animate-ping" style={{ animationDuration: "2s", animationDelay: "1s" }} />

          {/* Avatar */}
          <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-white/30 shadow-2xl relative">
            <img src={avatarSrc} alt={callerName} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Caller name */}
        <h1 className="text-3xl font-bold text-white text-center mb-1">{callerName}</h1>
        <p className="text-white/50 text-sm text-center mb-1">@{callerUsername}</p>

        {/* Ringing indicator */}
        <div className="flex items-center space-x-1.5 mt-2 mb-2">
          <Heart className="w-3.5 h-3.5 fill-pink-400 text-pink-400 animate-pulse" />
          <span className="text-pink-300 text-xs font-medium">
            {callType === "video" ? "Video calling you" : "Voice calling you"}
          </span>
          <Heart className="w-3.5 h-3.5 fill-pink-400 text-pink-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>

        {/* Auto-decline countdown */}
        <p className="text-white/30 text-xs mt-1">
          Auto-decline in {countdown}s
        </p>
      </div>

      {/* Bottom: Decline + Accept buttons (WhatsApp style) */}
      <div className="relative z-10 pb-16 px-10">
        <div className="flex items-center justify-between">

          {/* Decline */}
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleDecline}
              className="w-18 h-18 rounded-full bg-red-500/90 active:bg-red-600 active:scale-90 flex items-center justify-center shadow-2xl shadow-red-500/40 transition"
              style={{ width: 72, height: 72 }}
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>
            <span className="text-white/80 text-sm font-medium">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={handleAccept}
              className="rounded-full bg-emerald-500/90 active:bg-emerald-600 active:scale-90 flex items-center justify-center shadow-2xl shadow-emerald-500/40 transition"
              style={{ width: 72, height: 72 }}
            >
              {callType === "video"
                ? <Video className="w-8 h-8 text-white" />
                : <Phone className="w-8 h-8 text-white" />}
            </button>
            <span className="text-white/80 text-sm font-medium">
              {callType === "video" ? "Accept" : "Answer"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
