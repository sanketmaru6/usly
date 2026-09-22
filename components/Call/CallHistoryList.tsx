"use client";

import React, { useState, useEffect } from "react";
import {
  Video,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Clock,
  Sparkles,
  RefreshCw,
  MessageCircle,
} from "lucide-react";

export interface CallRecord {
  id: string;
  callId: string;
  callerUsername: string;
  callerName: string;
  callerAvatar?: string;
  receiverUsername: string;
  receiverName: string;
  type: "video" | "audio";
  status: "accepted" | "ended" | "missed" | "declined" | "ringing";
  durationSeconds: number;
  isOutgoing: boolean;
  partnerUsername: string;
  partnerName: string;
  partnerAvatar?: string;
  createdAt: string;
}

interface CallHistoryListProps {
  currentUsername: string;
  onStartCall: (partner: { username: string; name: string; avatar: string }, type: "audio" | "video") => void;
  onSelectChat: (partner: { username: string; name: string; avatar: string }) => void;
}

export default function CallHistoryList({
  currentUsername,
  onStartCall,
  onSelectChat,
}: CallHistoryListProps) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "missed" | "video" | "audio">("all");

  const fetchCalls = async () => {
    if (!currentUsername) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/calls/history?username=${encodeURIComponent(currentUsername)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.calls && Array.isArray(data.calls)) {
          setCalls(data.calls);
        }
      }
    } catch (e) {
      console.warn("Failed to load call history:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [currentUsername]);

  const formatDuration = (secs: number, status: string) => {
    if (status === "missed") return "Missed Call";
    if (status === "declined") return "Declined";
    if (secs <= 0) return "Connected";
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
  };

  const formatCallDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (isToday) return `Today, ${timeStr}`;
      const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === d.toDateString();
      if (isYesterday) return `Yesterday, ${timeStr}`;
      return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
    } catch {
      return "";
    }
  };

  const filteredCalls = calls.filter((call) => {
    if (filter === "missed") return call.status === "missed" || call.status === "declined";
    if (filter === "video") return call.type === "video";
    if (filter === "audio") return call.type === "audio";
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header & Filter Toolbar */}
      <div className="p-3 border-b border-white/10 bg-black/20 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-white uppercase tracking-wider">
              Call History
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-usly-pink/20 text-usly-coral border border-usly-pink/30">
              {calls.length}
            </span>
          </div>

          <button
            onClick={fetchCalls}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition active:scale-90"
            title="Refresh Call History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-usly-pink" : ""}`} />
          </button>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "video", label: "📹 Video" },
              { id: "audio", label: "📞 Voice" },
              { id: "missed", label: "❌ Missed" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition whitespace-nowrap active:scale-95 ${
                filter === tab.id
                  ? "bg-gradient-love text-white shadow-sm shadow-usly-pink/30"
                  : "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calls List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
        {loading && calls.length === 0 ? (
          <div className="text-center py-12 space-y-2 text-zinc-400 text-xs">
            <RefreshCw className="w-5 h-5 mx-auto animate-spin text-usly-pink" />
            <p>Loading call history...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="text-center py-14 px-4 space-y-3">
            <div className="w-12 h-12 rounded-3xl bg-usly-pink/15 border border-usly-pink/30 mx-auto flex items-center justify-center text-2xl animate-float">
              📹
            </div>
            <h4 className="text-xs sm:text-sm font-bold text-white">No Call Logs Found</h4>
            <p className="text-[11px] text-zinc-400 max-w-xs mx-auto leading-relaxed">
              {filter === "all"
                ? "You haven't made or received any video or audio calls yet. Start a call with your partner now!"
                : `No calls found under the "${filter}" filter.`}
            </p>
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isMissed = call.status === "missed" || call.status === "declined";
            const partner = {
              username: call.partnerUsername,
              name: call.partnerName,
              avatar: call.partnerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.partnerUsername}`,
            };

            return (
              <div
                key={call.id}
                className="group relative p-3 rounded-2xl bg-usly-surface/70 hover:bg-usly-surface border border-white/5 hover:border-usly-pink/30 transition-all shadow-sm flex items-center justify-between space-x-3"
              >
                {/* Avatar */}
                <div
                  className="relative flex-shrink-0 cursor-pointer"
                  onClick={() => onSelectChat(partner)}
                >
                  <img
                    src={partner.avatar}
                    alt={partner.name}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border border-usly-pink/30 shadow-md group-hover:border-usly-pink transition"
                  />
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-zinc-950" />
                </div>

                {/* Call Info */}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => onSelectChat(partner)}
                >
                  <div className="flex items-center space-x-1.5">
                    <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                      {partner.name}
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline truncate">
                      @{partner.username}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 mt-0.5 text-[11px]">
                    {/* Call Status Icon */}
                    {isMissed ? (
                      <PhoneMissed className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    ) : call.isOutgoing ? (
                      <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <PhoneIncoming className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    )}

                    {/* Call Type Label */}
                    <span className={`font-semibold ${isMissed ? "text-red-300" : "text-zinc-300"}`}>
                      {call.type === "video" ? "Video Call" : "Voice Call"}
                    </span>

                    <span className="text-zinc-500">•</span>

                    {/* Duration / Status */}
                    <span className={`text-[10px] ${isMissed ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
                      {formatDuration(call.durationSeconds, call.status)}
                    </span>
                  </div>

                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {formatCallDate(call.createdAt)}
                  </div>
                </div>

                {/* Quick Call-Back Actions */}
                <div className="flex items-center space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => onSelectChat(partner)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition active:scale-90"
                    title="Open Chat"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onStartCall(partner, "audio")}
                    className="p-2 rounded-xl bg-usly-purple/20 hover:bg-usly-purple/40 border border-purple-500/30 text-purple-300 hover:text-white transition active:scale-90"
                    title="Voice Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onStartCall(partner, "video")}
                    className="p-2 rounded-xl bg-gradient-love hover:opacity-95 text-white shadow-md shadow-usly-pink/25 transition active:scale-90"
                    title="Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
