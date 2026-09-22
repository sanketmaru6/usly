"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, Sparkles, Video, MessageCircle, ArrowRight, Shield } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const username = localStorage.getItem("usly_username");
    if (username) {
      router.push("/chat");
    }
  }, [router]);

  return (
    <div className="min-h-screen h-[100dvh] bg-usly-dark flex flex-col justify-between relative overflow-hidden text-white">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-usly-pink/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex items-center justify-between relative z-10 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-love p-0.5 shadow-lg shadow-usly-pink/30 flex items-center justify-center">
            <div className="w-full h-full bg-usly-dark rounded-[14px] flex items-center justify-center">
              <Heart className="w-5 h-5 text-usly-pink fill-usly-pink animate-heartbeat" />
            </div>
          </div>
          <span className="text-2xl font-black bg-gradient-love bg-clip-text text-transparent">
            Usly
          </span>
        </div>

        <Link
          href="/login"
          className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition active:scale-95 shadow-md"
        >
          Sign In
        </Link>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-12 text-center relative z-10 flex flex-col items-center flex-1 justify-center">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-usly-pink/20 border border-usly-pink/40 text-pink-200 text-[11px] sm:text-xs font-bold mb-4 sm:mb-6 animate-pulse">
          <Sparkles className="w-3.5 h-3.5 text-usly-pink" />
          <span>Private 1-on-1 Chat & HD Video Calling</span>
        </div>

        <h1 className="text-3xl sm:text-6xl font-black tracking-tight leading-tight mb-4 sm:mb-6">
          Connect, Chat & Call <br />
          <span className="bg-gradient-love bg-clip-text text-transparent">In Real-Time HD.</span>
        </h1>

        <p className="text-xs sm:text-base text-zinc-300 max-w-xl mx-auto mb-6 sm:mb-8 leading-relaxed">
          Search people, send direct chat requests, whisper voice notes, and make crystal-clear 1-on-1 HD video calls like Instagram.
        </p>

        {/* Call to action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-sm mb-8">
          <Link
            href="/login"
            className="w-full flex items-center justify-center space-x-2 py-3.5 px-6 rounded-2xl bg-gradient-love hover:opacity-95 text-white font-black text-sm shadow-xl shadow-usly-pink/40 transition active:scale-95"
          >
            <span>Start Chatting</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 w-full text-left max-w-3xl">
          <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 space-y-1.5">
            <div className="w-9 h-9 rounded-xl bg-usly-pink/20 flex items-center justify-center text-usly-pink">
              <MessageCircle className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-xs sm:text-sm">Real-time Direct Chat</h3>
            <p className="text-[11px] text-zinc-400">
              Instant messaging, stickers, voice notes with waveform audio, and emoji reactions.
            </p>
          </div>

          <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 space-y-1.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-300">
              <Video className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-xs sm:text-sm">HD 1080p Video Calling</h3>
            <p className="text-[11px] text-zinc-400">
              1-on-1 WebRTC HD video calling with floating reactions, camera flip, and selfie mirroring.
            </p>
          </div>

          <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 space-y-1.5">
            <div className="w-9 h-9 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-300">
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <h3 className="font-bold text-white text-xs sm:text-sm">Search & Connect</h3>
            <p className="text-[11px] text-zinc-400">
              Search any user handle or name, send instant requests, accept, and chat right away.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-[11px] text-zinc-500 border-t border-white/5 relative z-10 flex-shrink-0">
        <div className="flex items-center justify-center space-x-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Usly • End-to-End Real-Time Communications</span>
        </div>
      </footer>
    </div>
  );
}
