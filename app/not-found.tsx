"use client";

import React from "react";
import Link from "next/link";
import { Heart, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-usly-dark flex flex-col items-center justify-center p-4 text-center text-white">
      <div className="w-16 h-16 rounded-3xl bg-gradient-love p-1 shadow-xl shadow-usly-pink/30 flex items-center justify-center mb-4 animate-float">
        <div className="w-full h-full bg-usly-dark rounded-[20px] flex items-center justify-center">
          <Heart className="w-8 h-8 text-usly-pink fill-usly-pink animate-heartbeat" />
        </div>
      </div>
      <h2 className="text-3xl font-black mb-2">Page Not Found</h2>
      <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mb-6">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        href="/chat"
        className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-love text-white font-bold text-xs shadow-lg shadow-usly-pink/30 hover:opacity-95 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Chat</span>
      </Link>
    </div>
  );
}
