"use client";

import React, { useEffect, useRef } from "react";
import { X, Sparkles, Heart } from "lucide-react";
import { PING_OPTIONS, PingOption } from "@/lib/lovePings";

interface PingPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPing: (ping: PingOption) => void;
  partnerName?: string;
}

export default function PingPickerModal({
  isOpen,
  onClose,
  onSelectPing,
  partnerName = "your partner",
}: PingPickerModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-zinc-950/95 border border-usly-pink/30 p-4 sm:p-6 shadow-2xl shadow-usly-pink/20 overflow-hidden text-white animate-in zoom-in-95 duration-200"
        style={{
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-usly-pink/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-usly-pink/20 border border-usly-pink/40 flex items-center justify-center shadow-inner">
              <Heart className="w-5 h-5 text-usly-pink fill-usly-pink animate-heartbeat" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-1.5">
                <span>Send a Romantic Ping</span>
                <Sparkles className="w-4 h-4 text-usly-coral" />
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                Tap an emotion to buzz <span className="text-pink-300 font-semibold">{partnerName}</span>'s screen!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white transition active:scale-90"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ping Options Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 py-1">
          {PING_OPTIONS.map((ping) => {
            return (
              <button
                key={ping.id}
                onClick={() => {
                  onSelectPing(ping);
                  onClose();
                }}
                className={`group relative p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br ${ping.badgeGradient} border ${ping.borderColor} hover:scale-[1.03] active:scale-[0.97] transition-all text-left flex flex-col justify-between shadow-lg ${ping.glowColor} overflow-hidden`}
              >
                {/* Subtle Hover Spotlight */}
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl sm:text-3xl group-hover:scale-125 transition-transform origin-left">
                    {ping.icon}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                    Ping
                  </span>
                </div>

                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white leading-tight flex items-center space-x-1">
                    <span>{ping.title}</span>
                  </h4>
                  <p className="text-[10px] sm:text-[11px] text-zinc-300/80 line-clamp-1 mt-0.5">
                    {ping.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Hint */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
          <span>💖 Plays real-time melody & screen shake</span>
          <span className="font-mono text-usly-coral">Usly Pings</span>
        </div>
      </div>
    </div>
  );
}
