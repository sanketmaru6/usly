"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Heart,
  Play,
  Pause,
  Sparkles,
  Volume2,
  ChevronDown,
  X,
  Download,
  Maximize2,
} from "lucide-react";
import { getPingOptionFromContent } from "@/lib/lovePings";
import { CHAT_THEMES, ChatThemeId, DEFAULT_THEME_ID } from "@/lib/themes";

export interface MessageItem {
  id: string;
  senderUsername: string;
  senderName?: string;
  senderAvatar?: string;
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
  partnerAvatar?: string;
  themeId?: ChatThemeId;
  onAddReaction?: (messageId: string, emoji: string) => void;
  isPartnerTyping?: boolean;
}

const INSTAGRAM_QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "🙏", "🔥"];

export default function MessageList({
  messages,
  currentUsername,
  partnerName = "Partner",
  partnerAvatar,
  themeId = DEFAULT_THEME_ID,
  onAddReaction,
  isPartnerTyping,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Double tap to like heart animation tracker
  const [heartAnimMessageId, setHeartAnimMessageId] = useState<string | null>(null);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });

  // Auto-scroll control & smart scroll position detection
  const [autoScroll] = useState<boolean>(true);
  const [isNearBottom, setIsNearBottom] = useState<boolean>(true);
  const [newMessagesBelow, setNewMessagesBelow] = useState<number>(0);
  const prevMessagesLengthRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);

  const activeTheme = CHAT_THEMES[themeId] || CHAT_THEMES.sunset;

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
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
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
      requestAnimationFrame(() => scrollToBottom("auto"));
    } else if (currentCount > prevCount) {
      if (isMyMessage) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else if (autoScroll && isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else {
        setNewMessagesBelow((prev) => prev + (currentCount - prevCount));
      }
    } else if (isPartnerTyping && autoScroll && isNearBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }

    prevMessagesLengthRef.current = currentCount;
  }, [messages, isPartnerTyping, autoScroll, currentUsername]);

  // Instagram-style double tap to like with red heart animation
  const handleBubbleClick = (msgId: string) => {
    const now = Date.now();
    if (lastTapRef.current.id === msgId && now - lastTapRef.current.time < 350) {
      // Double tap detected!
      if (onAddReaction) {
        onAddReaction(msgId, "❤️");
      }
      setHeartAnimMessageId(msgId);
      setTimeout(() => {
        setHeartAnimMessageId(null);
      }, 900);
      lastTapRef.current = { id: "", time: 0 };
    } else {
      lastTapRef.current = { id: msgId, time: now };
    }
  };

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
      if (isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const getMessageDateHeader = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return "Today";
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className={`relative flex-1 flex flex-col min-h-0 overflow-hidden select-none sm:select-auto ${activeTheme.chatBg}`}>
      {/* Messages Scroll Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-5 space-y-1 relative scroll-smooth overscroll-contain"
      >
        {messages.filter(Boolean).map((msg, index) => {
          const isMe = (msg.senderUsername || "").toLowerCase() === (currentUsername || "").toLowerCase();
          const contentStr = msg.content || "";

          // Date divider calculation
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

          const showDateDivider =
            !prevMsg ||
            new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
          const dateLabel = showDateDivider ? getMessageDateHeader(msg.createdAt) : "";

          // Consecutive message grouping calculation (Instagram clusters)
          const isSameSenderAsPrev =
            prevMsg &&
            (prevMsg.senderUsername || "").toLowerCase() === (msg.senderUsername || "").toLowerCase();
          const isSameSenderAsNext =
            nextMsg &&
            (nextMsg.senderUsername || "").toLowerCase() === (msg.senderUsername || "").toLowerCase();

          const timeDiffPrev = prevMsg
            ? Math.abs(new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime())
            : Infinity;
          const isGroupedWithPrev = isSameSenderAsPrev && timeDiffPrev < 2 * 60 * 1000 && !showDateDivider;
          const isLastInCluster = !isSameSenderAsNext;

          // Instagram corner radius calculation
          let bubbleRadius = isMe
            ? isGroupedWithPrev
              ? "rounded-[18px] rounded-br-[6px]"
              : "rounded-[22px] rounded-br-[4px]"
            : isGroupedWithPrev
            ? "rounded-[18px] rounded-bl-[6px]"
            : "rounded-[22px] rounded-bl-[4px]";

          return (
            <React.Fragment key={msg.id || `msg_${index}`}>
              {/* Instagram Date Header */}
              {showDateDivider && dateLabel && (
                <div className="flex justify-center my-4 sticky top-1 z-10">
                  <span className="px-3 py-1 rounded-full bg-[#1e1e1e]/90 border border-white/10 text-[10px] sm:text-[11px] font-semibold text-zinc-300 shadow-md backdrop-blur-md">
                    {dateLabel}
                  </span>
                </div>
              )}

              {/* 1. LOVE PING MESSAGE TYPE */}
              {msg.type === "love_ping" && (() => {
                const pingOpt = getPingOptionFromContent(contentStr);
                return (
                  <div className={`flex justify-center px-2 ${isGroupedWithPrev ? "mt-1" : "my-3"}`}>
                    <div
                      className={`relative max-w-sm sm:max-w-md w-full px-4 py-3 rounded-[22px] bg-gradient-to-r ${pingOpt.badgeGradient} border ${pingOpt.borderColor} shadow-xl ${pingOpt.glowColor} text-center space-y-1 transition-transform hover:scale-[1.01]`}
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
                      <div className="flex items-center justify-center space-x-1 text-[9px] text-white/60 pt-0.5 font-mono">
                        <span>{formatTime(msg.createdAt)}</span>
                        {isMe && <span className="text-pink-200 text-[10px] font-bold">✓</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. IMAGE / PHOTO MESSAGE TYPE */}
              {msg.type === "image" && (
                <div className={`flex ${isMe ? "justify-end" : "justify-start items-end"} ${isGroupedWithPrev ? "mt-1" : "mt-2.5"}`}>
                  {/* Partner Avatar Thumbnail beside last message in cluster */}
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 mb-0.5 overflow-hidden">
                      {isLastInCluster && (
                        <img
                          src={partnerAvatar || msg.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerName}`}
                          alt={partnerName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      )}
                    </div>
                  )}

                  <div className="flex flex-col max-w-[78%] sm:max-w-sm">
                    <div
                      className={`relative p-1 overflow-hidden transition-all shadow-lg ${bubbleRadius} ${
                        isMe ? activeTheme.sentBubble : activeTheme.partnerBubble
                      }`}
                      onClick={() => handleBubbleClick(msg.id)}
                    >
                      <div
                        className="cursor-pointer overflow-hidden rounded-[18px] relative group bg-black/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImageUrl(contentStr);
                        }}
                      >
                        <img
                          src={contentStr}
                          alt="Shared photo"
                          className="max-h-72 sm:max-h-96 w-auto object-cover rounded-[18px] group-hover:scale-[1.02] transition-transform duration-200"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 rounded-full bg-black/75 text-[11px] font-bold text-white backdrop-blur-md flex items-center space-x-1 shadow-lg">
                            <Maximize2 className="w-3.5 h-3.5 text-pink-400" />
                            <span>View</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-2 pt-1 pb-0.5 text-[9px] sm:text-[10px] text-white/70">
                        <span className="font-medium">{isMe ? "You" : partnerName}</span>
                        <span>{formatTime(msg.createdAt)}</span>
                      </div>

                      {/* Double tap heart animation */}
                      {heartAnimMessageId === msg.id && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in zoom-in-50 fade-out duration-700">
                          <Heart className="w-16 h-16 fill-red-500 text-red-500 drop-shadow-2xl animate-ping" />
                        </div>
                      )}

                      {/* Display reactions */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="absolute -bottom-2.5 right-2 flex items-center space-x-0.5 bg-[#262626] border border-white/20 px-2 py-0.5 rounded-full shadow-lg text-[11px]">
                          {msg.reactions.map((r, i) => (
                            <span key={`${r.user}_${r.emoji}_${i}`} title={r.user}>
                              {r.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Instagram Quick Reactions on hover/tap */}
                    {onAddReaction && (
                      <div
                        className={`flex items-center space-x-1 mt-1 px-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${
                          isMe ? "justify-end" : "justify-start"
                        }`}
                      >
                        {INSTAGRAM_QUICK_EMOJIS.slice(0, 5).map((emoji) => (
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
              )}

              {/* 3. ROMANTIC STICKER TYPE */}
              {msg.type === "sticker" && (
                <div className={`flex ${isMe ? "justify-end" : "justify-start items-end"} ${isGroupedWithPrev ? "mt-0.5" : "mt-2"}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 mb-0.5 overflow-hidden">
                      {isLastInCluster && (
                        <img
                          src={partnerAvatar || msg.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerName}`}
                          alt={partnerName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      )}
                    </div>
                  )}

                  <div className="flex flex-col items-end">
                    <div className="text-5xl sm:text-6xl p-2 rounded-2xl hover:scale-110 transition-transform">
                      {contentStr || "✨"}
                    </div>
                    <div className="flex items-center space-x-1 text-[10px] text-zinc-400 mt-0.5 px-1">
                      <span>{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. VOICE NOTE MESSAGE TYPE */}
              {msg.type === "voice" && (
                <div className={`flex ${isMe ? "justify-end" : "justify-start items-end"} ${isGroupedWithPrev ? "mt-1" : "mt-2.5"}`}>
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 mb-0.5 overflow-hidden">
                      {isLastInCluster && (
                        <img
                          src={partnerAvatar || msg.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerName}`}
                          alt={partnerName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] sm:max-w-md p-3 shadow-md ${bubbleRadius} ${
                      isMe ? activeTheme.sentBubble : activeTheme.partnerBubble
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handlePlayVoice(msg.id, contentStr)}
                        className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition active:scale-95 flex-shrink-0"
                      >
                        {playingAudioId === msg.id ? (
                          <Pause className="w-5 h-5 text-white" />
                        ) : (
                          <Play className="w-5 h-5 text-white ml-0.5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1.5 mb-1">
                          <Volume2 className="w-3.5 h-3.5 text-pink-200 flex-shrink-0" />
                          <span className="text-xs font-semibold">Voice Message</span>
                          <span className="text-[10px] text-white/70">({msg.audioDuration || 3}s)</span>
                        </div>

                        {/* Animated sound bars */}
                        <div className="flex items-center space-x-1 h-4">
                          {[3, 7, 10, 6, 12, 8, 4, 11, 7, 5, 9, 3].map((height, i) => (
                            <div
                              key={i}
                              className={`w-1 rounded-full bg-white/70 ${
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
              )}

              {/* 5. REGULAR TEXT / INSTAGRAM BUBBLE */}
              {(!msg.type || msg.type === "text" || msg.type === "question") && (
                <div className={`flex ${isMe ? "justify-end" : "justify-start items-end"} group ${isGroupedWithPrev ? "mt-0.5" : "mt-1.5"}`}>
                  {/* Partner Avatar on left */}
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 mb-0.5 overflow-hidden">
                      {isLastInCluster ? (
                        <img
                          src={partnerAvatar || msg.senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerName}`}
                          alt={partnerName}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7" />
                      )}
                    </div>
                  )}

                  <div className="flex flex-col max-w-[78%] sm:max-w-md relative">
                    <div
                      onClick={() => handleBubbleClick(msg.id)}
                      className={`relative px-4 py-2 sm:py-2.5 text-[14px] leading-relaxed transition-all shadow-sm select-text cursor-pointer active:scale-[0.99] ${bubbleRadius} ${
                        isMe ? activeTheme.sentBubble : activeTheme.partnerBubble
                      }`}
                    >
                      {/* Text Content */}
                      <p className="whitespace-pre-wrap break-words">{contentStr}</p>

                      {/* Double tap heart animation */}
                      {heartAnimMessageId === msg.id && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in zoom-in-50 fade-out duration-700">
                          <Heart className="w-12 h-12 fill-red-500 text-red-500 drop-shadow-2xl animate-ping" />
                        </div>
                      )}

                      {/* Display reactions pill */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="absolute -bottom-2.5 right-2 flex items-center space-x-0.5 bg-[#262626] border border-white/20 px-2 py-0.5 rounded-full shadow-lg text-[11px] z-10">
                          {msg.reactions.map((r, i) => (
                            <span key={`${r.user}_${r.emoji}_${i}`} title={r.user}>
                              {r.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Instagram Seen / Timestamp on last message or hover */}
                    {isLastInCluster && (
                      <div className={`flex items-center space-x-1 mt-0.5 px-1 text-[10px] text-zinc-400 ${isMe ? "justify-end" : "justify-start"}`}>
                        <span>{formatTime(msg.createdAt)}</span>
                        {isMe && <span className="text-pink-400 font-medium text-[10px]">Seen</span>}
                      </div>
                    )}

                    {/* Quick Reactions Bar on Touch/Hover */}
                    {onAddReaction && (
                      <div
                        className={`flex items-center space-x-1 mt-0.5 px-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ${
                          isMe ? "justify-end" : "justify-start"
                        }`}
                      >
                        {INSTAGRAM_QUICK_EMOJIS.map((emoji) => (
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
              )}
            </React.Fragment>
          );
        })}

        {/* Partner Typing Indicator */}
        {isPartnerTyping && (
          <div className="flex items-center space-x-2 text-xs text-zinc-400 pl-9 py-1">
            <div className="flex space-x-1 bg-[#262626] border border-white/10 rounded-full px-3 py-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0s" }} />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0.15s" }} />
              <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
            </div>
            <span className="text-[11px] text-zinc-400">{partnerName} is typing...</span>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Floating Scroll to Bottom / New Messages Pill */}
      {(!isNearBottom || newMessagesBelow > 0) && (
        <div className="absolute bottom-3 right-4 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => scrollToBottom("smooth")}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[#262626] text-white text-xs font-bold shadow-xl border border-white/20 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronDown className="w-4 h-4 animate-bounce text-pink-400" />
            <span>
              {newMessagesBelow > 0 ? `${newMessagesBelow} new` : "Latest"}
            </span>
          </button>
        </div>
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[9000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="absolute top-4 right-4 flex items-center space-x-2 z-10" onClick={(e) => e.stopPropagation()}>
            <a
              href={previewImageUrl}
              download="instagram_photo.jpg"
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-90 flex items-center space-x-1.5 text-xs font-bold shadow-lg"
              title="Download Photo"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </a>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-90"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Fullscreen preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
