"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Heart,
  Play,
  Pause,
  Sparkles,
  Volume2,
  ChevronDown,
  ArrowDownCircle,
  X,
  Download,
  Maximize2,
} from "lucide-react";
import { getPingOptionFromContent } from "@/lib/lovePings";

export interface MessageItem {
  id: string;
  senderUsername: string;
  senderName?: string;
  type: "text" | "voice" | "image" | "love_ping" | "sticker" | "question";
  content: string;
  audioDuration?: number;
  reactions?: Array<{ user: string; emoji: string }>;
  createdAt: string;
}

interface MessageListProps {
  messages: MessageItem[];
  currentUsername: string;
  partnerName?: string;
  onAddReaction?: (messageId: string, emoji: string) => void;
  isPartnerTyping?: boolean;
}

const QUICK_EMOJIS = ["❤️", "💖", "🥰", "💋", "🔥", "🥺", "✨"];

export default function MessageList({
  messages,
  currentUsername,
  partnerName = "Partner",
  onAddReaction,
  isPartnerTyping,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll control & smart scroll position detection
  const [autoScroll] = useState<boolean>(true);
  const [isNearBottom, setIsNearBottom] = useState<boolean>(true);
  const [newMessagesBelow, setNewMessagesBelow] = useState<number>(0);
  const prevMessagesLengthRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);

  const checkIfNearBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceToBottom < 120;
  };

  const handleScroll = () => {
    const nearBottom = checkIfNearBottom();
    setIsNearBottom(nearBottom);
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setNewMessagesBelow(0);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    setNewMessagesBelow(0);
    setIsNearBottom(true);
    isNearBottomRef.current = true;
  };

  // Smart scroll effect on message changes
  useEffect(() => {
    const prevCount = prevMessagesLengthRef.current;
    const currentCount = messages.length;
    const isInitialLoad = prevCount === 0 && currentCount > 0;
    const lastMsg = messages[messages.length - 1];
    const isMyMessage = lastMsg?.senderUsername?.toLowerCase() === currentUsername?.toLowerCase();

    if (isInitialLoad) {
      setTimeout(() => scrollToBottom("auto"), 50);
    } else if (currentCount > prevCount) {
      if (isMyMessage) {
        scrollToBottom("smooth");
      } else if (autoScroll && isNearBottomRef.current) {
        scrollToBottom("smooth");
      } else {
        setNewMessagesBelow((prev) => prev + (currentCount - prevCount));
      }
    } else if (isPartnerTyping && autoScroll && isNearBottomRef.current) {
      scrollToBottom("smooth");
    }

    prevMessagesLengthRef.current = currentCount;
  }, [messages, isPartnerTyping, autoScroll, currentUsername]);

  const handlePlayVoice = (id: string, audioBase64: string) => {
    if (playingAudioId === id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audioBase64);
      audioRef.current = audio;
      audio.play();
      setPlayingAudioId(id);
      audio.onended = () => setPlayingAudioId(null);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Messages Scroll Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 relative scroll-smooth"
      >

        {messages.filter(Boolean).map((msg) => {
          const isMe = (msg.senderUsername || "").toLowerCase() === (currentUsername || "").toLowerCase();
          const contentStr = msg.content || "";

          // 1. LOVE PING MESSAGE TYPE (Love You, Miss You, Kiss, Hug, Thinking of You, Nudge)
          if (msg.type === "love_ping") {
            const pingOpt = getPingOptionFromContent(contentStr);
            return (
              <div key={msg.id} className="flex justify-center my-3.5 px-2">
                <div
                  className={`relative max-w-sm sm:max-w-md w-full px-4 py-3 rounded-2xl sm:rounded-3xl bg-gradient-to-r ${pingOpt.badgeGradient} border ${pingOpt.borderColor} shadow-xl ${pingOpt.glowColor} text-center space-y-1 transition-transform hover:scale-[1.02]`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <span className="text-xl sm:text-2xl animate-bounce">{pingOpt.icon}</span>
                    <span className="text-xs sm:text-sm font-black text-white tracking-wide">
                      {isMe ? `You sent a ${pingOpt.title} Ping!` : `${partnerName} sent you a ${pingOpt.title} Ping!`}
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-usly-coral animate-spin" />
                  </div>
                  <p className={`text-[11px] sm:text-xs font-semibold ${pingOpt.textColor} line-clamp-2`}>
                    {contentStr.includes("•") ? contentStr.split("•")[1]?.trim() : (contentStr || pingOpt.subtitle)}
                  </p>
                  <div className="text-[9px] text-white/50 pt-0.5 font-mono">
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          }

          // 2. IMAGE / PHOTO MESSAGE TYPE
          if (msg.type === "image") {
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} my-2.5`}>
                <div className="flex flex-col max-w-[85%] sm:max-w-sm">
                  <div
                    className={`relative rounded-2xl sm:rounded-3xl p-1.5 overflow-hidden transition-all shadow-lg ${
                      isMe ? "glass-bubble-me" : "glass-bubble-partner"
                    }`}
                  >
                    <div
                      className="cursor-pointer overflow-hidden rounded-xl sm:rounded-2xl relative group bg-black/40"
                      onClick={() => setPreviewImageUrl(contentStr)}
                    >
                      <img
                        src={contentStr}
                        alt="Shared photo"
                        className="max-h-72 sm:max-h-96 w-auto object-cover rounded-xl sm:rounded-2xl group-hover:scale-[1.02] transition-transform duration-200"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 rounded-full bg-black/70 text-[11px] font-bold text-white backdrop-blur-md flex items-center space-x-1 shadow-lg">
                          <Maximize2 className="w-3.5 h-3.5 text-usly-pink" />
                          <span>View Photo</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5 text-[9px] sm:text-[10px] text-white/70">
                      <span>{isMe ? "You" : partnerName}</span>
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>

                    {/* Display reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="absolute -bottom-2.5 right-2 sm:right-3 flex items-center space-x-1 bg-usly-surface/95 border border-usly-pink/40 px-1.5 sm:px-2 py-0.5 rounded-full shadow-lg text-[10px] sm:text-xs">
                        {msg.reactions.map((r, i) => (
                          <span key={`${r.user}_${r.emoji}_${i}`} title={r.user}>
                            {r.emoji}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reactions Bar */}
                  {onAddReaction && (
                    <div
                      className={`flex items-center space-x-1 mt-1 px-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      {QUICK_EMOJIS.slice(0, 4).map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => onAddReaction(msg.id, emoji)}
                          className="text-xs hover:scale-125 transition-transform p-1 rounded-full hover:bg-white/10 active:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // 3. ROMANTIC STICKER TYPE
          if (msg.type === "sticker") {
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} my-2`}>
                <div className="flex flex-col items-end">
                  <div className="text-6xl p-2 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:scale-110 transition-transform">
                    {contentStr || "✨"}
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-1 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          }

          // 4. VOICE NOTE MESSAGE TYPE
          if (msg.type === "voice") {
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} my-2`}>
                <div
                  className={`max-w-[85%] sm:max-w-md rounded-2xl p-3.5 ${
                    isMe ? "glass-bubble-me text-white" : "glass-bubble-partner text-zinc-100"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handlePlayVoice(msg.id, contentStr)}
                      className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95"
                    >
                      {playingAudioId === msg.id ? (
                        <Pause className="w-5 h-5 text-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      )}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-center space-x-1.5 mb-1">
                        <Volume2 className="w-3.5 h-3.5 text-pink-200" />
                        <span className="text-xs font-semibold">Voice Whisper</span>
                        <span className="text-[10px] text-white/70">({msg.audioDuration || 3}s)</span>
                      </div>

                      {/* Animated sound bars */}
                      <div className="flex items-center space-x-1 h-4">
                        {[3, 7, 10, 6, 12, 8, 4, 11, 7, 5, 9, 3].map((height, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full bg-white/60 ${
                              playingAudioId === msg.id ? "animate-pulse" : ""
                            }`}
                            style={{
                              height: `${height + 2}px`,
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/10 text-[10px] text-white/70">
                    <span>{isMe ? "You" : partnerName}</span>
                    <span>{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          }

          // 5. REGULAR TEXT / LOVE NOTE MESSAGE
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
              <div className="flex flex-col max-w-[88%] sm:max-w-md">
                <div
                  className={`relative rounded-2xl sm:rounded-3xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm leading-relaxed transition-all shadow-md ${
                    isMe
                      ? "glass-bubble-me text-white rounded-br-sm"
                      : "glass-bubble-partner text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {/* Text Content */}
                  <p className="whitespace-pre-wrap break-words">{contentStr}</p>

                  {/* Footer with timestamp */}
                  <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] sm:text-[10px] text-white/70">
                    <span>{formatTime(msg.createdAt)}</span>
                  </div>

                  {/* Display reactions */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="absolute -bottom-2.5 right-2 sm:right-3 flex items-center space-x-1 bg-usly-surface/95 border border-usly-pink/40 px-1.5 sm:px-2 py-0.5 rounded-full shadow-lg text-[10px] sm:text-xs">
                      {msg.reactions.map((r, i) => (
                        <span key={`${r.user}_${r.emoji}_${i}`} title={r.user}>
                          {r.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Touch & Hover Emoji Reactions Bar */}
                {onAddReaction && (
                  <div
                    className={`flex items-center space-x-1 mt-1 px-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${
                      isMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    {QUICK_EMOJIS.slice(0, 4).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onAddReaction(msg.id, emoji)}
                        className="text-xs hover:scale-125 transition-transform p-1 rounded-full hover:bg-white/10 active:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Partner Typing Indicator */}
        {isPartnerTyping && (
          <div className="flex items-center space-x-2 text-xs text-usly-coral/90 pl-2">
            <div className="flex space-x-1 bg-usly-surface/80 border border-usly-pink/30 rounded-full px-3 py-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-usly-pink animate-bounce" style={{ animationDelay: "0s" }} />
              <span className="w-2 h-2 rounded-full bg-usly-pink animate-bounce" style={{ animationDelay: "0.15s" }} />
              <span className="w-2 h-2 rounded-full bg-usly-pink animate-bounce" style={{ animationDelay: "0.3s" }} />
            </div>
            <span className="italic">{partnerName} is typing...</span>
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Floating Scroll to Bottom / New Messages Pill */}
      {(!isNearBottom || newMessagesBelow > 0) && (
        <div className="absolute bottom-3 right-4 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => scrollToBottom("smooth")}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-gradient-love text-white text-xs font-bold shadow-xl shadow-usly-pink/40 border border-white/20 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronDown className="w-4 h-4 animate-bounce" />
            <span>
              {newMessagesBelow > 0 ? `${newMessagesBelow} new message${newMessagesBelow > 1 ? "s" : ""}` : "Scroll to Latest"}
            </span>
          </button>
        </div>
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[9000] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="absolute top-4 right-4 flex items-center space-x-2 z-10" onClick={(e) => e.stopPropagation()}>
            <a
              href={previewImageUrl}
              download="usly_photo.jpg"
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition active:scale-90 flex items-center space-x-1.5 text-xs font-bold shadow-lg"
              title="Download Photo"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </a>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition active:scale-90"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/10 shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Fullscreen preview"
              className="max-w-full max-h-[85vh] object-contain rounded-3xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
