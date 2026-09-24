"use client";

import React from "react";
import { X, Check, Sparkles } from "lucide-react";
import { CHAT_THEMES, ChatThemeId, ChatTheme } from "@/lib/themes";

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentThemeId: ChatThemeId;
  onSelectTheme: (themeId: ChatThemeId) => void;
}

export default function ThemePickerModal({
  isOpen,
  onClose,
  currentThemeId,
  onSelectTheme,
}: ThemePickerModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9500] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#181818] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Chat Themes</h3>
              <p className="text-xs text-zinc-400">Choose your favorite Instagram look</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition active:scale-95"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Themes Options */}
        <div className="space-y-3 pt-1">
          {Object.values(CHAT_THEMES).map((theme: ChatTheme) => {
            const isSelected = currentThemeId === theme.id;
            return (
              <div
                key={theme.id}
                onClick={() => {
                  onSelectTheme(theme.id);
                  onClose();
                }}
                className={`relative cursor-pointer p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                  isSelected
                    ? "bg-white/[0.08] border-pink-500 shadow-lg shadow-pink-500/10 ring-1 ring-pink-500"
                    : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3.5">
                    {/* Theme Swatch Circle */}
                    <div
                      className={`w-12 h-12 rounded-full bg-gradient-to-tr ${theme.previewGradient} flex items-center justify-center text-xl shadow-md flex-shrink-0`}
                    >
                      {theme.icon}
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-1.5">
                        <span>{theme.name}</span>
                        {isSelected && (
                          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            Active
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{theme.tagline}</p>
                    </div>
                  </div>

                  {/* Radio checkmark */}
                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? "bg-pink-500 border-pink-500 text-white"
                        : "border-white/30 text-transparent"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                {/* Sample Chat Bubbles Preview */}
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] gap-2">
                  <div
                    className={`px-3 py-1.5 rounded-[14px] rounded-bl-[2px] max-w-[48%] truncate ${theme.partnerBubble}`}
                  >
                    Hey there! ✨
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-[14px] rounded-br-[2px] max-w-[48%] truncate ${theme.sentBubble}`}
                  >
                    Love this look! 💖
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-zinc-500 pt-1">
          Theme applies to your conversation background and message bubbles.
        </p>
      </div>
    </div>
  );
}
