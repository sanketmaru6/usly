"use client";

import React, { useEffect, useState } from "react";

export interface FloatingParticleItem {
  id: number;
  x: number;
  y: number;
  size: number;
  emoji: string;
}

interface HeartEffectProps {
  triggerHeart?: number;
  customEmojis?: string[];
}

export default function HeartEffect({ triggerHeart, customEmojis }: HeartEffectProps) {
  const [particles, setParticles] = useState<FloatingParticleItem[]>([]);

  useEffect(() => {
    if (!triggerHeart) return;

    const defaultEmojis = ["❤️", "💖", "💕", "💘", "💋", "🥰", "✨", "💓"];
    const emojis = customEmojis && customEmojis.length > 0 ? customEmojis : defaultEmojis;

    const newParticles: FloatingParticleItem[] = Array.from({ length: 14 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      x: 20 + Math.random() * 60, // across 20% - 80% width
      y: 65 + Math.random() * 25, // from lower screen
      size: 22 + Math.random() * 26,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));

    setParticles((prev) => [...prev, ...newParticles]);

    const timer = setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, 2600);

    return () => clearTimeout(timer);
  }, [triggerHeart, customEmojis]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-floating-heart select-none drop-shadow-md"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: `${p.size}px`,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}
