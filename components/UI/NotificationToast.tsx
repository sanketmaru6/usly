"use client";

import React, { useEffect, useState } from "react";
import { Heart, Mic, X } from "lucide-react";
import { ToastNotification } from "@/lib/notifications";
import { getPingOptionFromContent } from "@/lib/lovePings";

interface NotificationToastProps {
  notification: ToastNotification | null;
  onDismiss: () => void;
  onSelectUser: (user: { username: string; name: string; avatar: string }) => void;
}

export default function NotificationToast({
  notification,
  onDismiss,
  onSelectUser,
}: NotificationToastProps) {
  const [progress, setProgress] = useState(100);
  const DURATION = 4500;

  useEffect(() => {
    if (!notification) return;
    setProgress(100);

    // Progress bar countdown
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(pct);
    }, 50);

    const timer = setTimeout(() => {
      onDismiss();
    }, DURATION);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [notification?.id, onDismiss]);

  if (!notification) return null;

  const getMessagePreview = () => {
    if (notification.type === "love_ping") {
      const ping = getPingOptionFromContent(notification.content);
      return {
        icon: ping.icon,
        text: `Sent you a ${ping.title} Ping!`,
        color: "text-usly-coral",
      };
    }
    if (notification.type === "image") return { icon: "📷", text: "Sent a photo", color: "text-sky-300" };
    if (notification.type === "voice") return { icon: "🎤", text: "Voice whisper...", color: "text-purple-300" };
    if (notification.type === "sticker") return { icon: "✨", text: "Sent a sticker", color: "text-yellow-300" };
    if (notification.type === "call") return { icon: "📞", text: "Incoming call...", color: "text-emerald-300" };
    return { icon: null, text: notification.content, color: "text-zinc-200" };
  };

  const preview = getMessagePreview();

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className="pointer-events-auto w-full max-w-sm"
        style={{ animation: "toastSlideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}
      >
        {/* Main toast card */}
        <div
          onClick={() => {
            onSelectUser({
              username: notification.senderUsername,
              name: notification.senderName,
              avatar: notification.senderAvatar,
            });
            onDismiss();
          }}
          className="relative overflow-hidden rounded-2xl cursor-pointer active:scale-[0.98] transition-transform"
          style={{
            background: "rgba(18, 8, 30, 0.96)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(236, 72, 153, 0.35)",
            boxShadow: "0 8px 32px rgba(236, 72, 153, 0.2), 0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          {/* Progress bar at top */}
          <div className="absolute top-0 left-0 h-[2px] bg-usly-pink/30 w-full">
            <div
              className="h-full bg-gradient-to-r from-usly-pink to-usly-coral transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center space-x-3 p-3 pt-3.5">
            {/* Avatar + online dot */}
            <div className="relative flex-shrink-0">
              <img
                src={notification.senderAvatar}
                alt={notification.senderName}
                className="w-11 h-11 rounded-full object-cover border-2 border-usly-pink/50"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#12081e]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="text-[11px] font-black text-white truncate">{notification.senderName}</span>
                  <span className="text-[10px] text-zinc-500 font-mono truncate hidden sm:inline">@{notification.senderUsername}</span>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                  <span className="text-[9px] text-pink-300/80 font-semibold whitespace-nowrap">just now</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    className="p-0.5 rounded-full text-zinc-500 hover:text-white transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className={`text-xs mt-0.5 truncate font-medium ${preview.color}`}>
                {preview.icon && <span className="mr-1">{preview.icon}</span>}
                {preview.text}
              </p>
            </div>
          </div>

          {/* App label bottom-right */}
          <div className="absolute bottom-2 right-3">
            <span className="text-[8px] font-bold text-usly-pink/40 font-mono uppercase tracking-widest">Usly</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes toastSlideDown {
          from { opacity: 0; transform: translateY(-100%) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
