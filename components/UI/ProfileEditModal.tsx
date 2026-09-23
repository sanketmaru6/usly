"use client";

import React, { useState } from "react";
import { X, Check, Camera, Sparkles, Heart, User, Dices, Smile, Wand2 } from "lucide-react";

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    username: string;
    name: string;
    avatar: string;
    mood: string;
  };
  onSaveProfile: (updated: {
    username: string;
    name: string;
    avatar: string;
    mood: string;
  }) => Promise<void>;
}

export interface AvatarItem {
  name: string;
  url: string;
  category: "cuties" | "anime" | "adventurer" | "emoji" | "classic";
}

export const CUTE_AVATARS: AvatarItem[] = [
  // 1. Cuties & Chibi
  { name: "Mochi Bunny", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Lily", category: "cuties" },
  { name: "Sweetheart", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Chloe", category: "cuties" },
  { name: "Cute Kitten", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Mimi", category: "cuties" },
  { name: "Teddy Bear", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Teddy", category: "cuties" },
  { name: "Panda Pup", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Coco", category: "cuties" },
  { name: "Baby Angel", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Baby", category: "cuties" },
  { name: "Sunshine", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Daisy", category: "cuties" },
  { name: "Cloudie", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Fluffy", category: "cuties" },
  { name: "Honey Pie", url: "https://api.dicebear.com/7.x/big-ears/svg?seed=Honey", category: "cuties" },

  // 2. Anime & Lovely
  { name: "Sakura Girl", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Sakura", category: "anime" },
  { name: "Aria", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Aria", category: "anime" },
  { name: "Haruto", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Haruto", category: "anime" },
  { name: "Yuki Snow", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Yuki", category: "anime" },
  { name: "Mei Mei", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Mei", category: "anime" },
  { name: "Cool Ren", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Ren", category: "anime" },
  { name: "Kira Star", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Kira", category: "anime" },
  { name: "Hana Blossom", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Hana", category: "anime" },
  { name: "Sora Sky", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Sora", category: "anime" },

  // 3. Adventurer & Royalty
  { name: "Love Princess", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Princess", category: "adventurer" },
  { name: "Charming Prince", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Knight", category: "adventurer" },
  { name: "Rose Fairy", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Fairy", category: "adventurer" },
  { name: "Star Mage", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Wizard", category: "adventurer" },
  { name: "Day Dreamer", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Dreamer", category: "adventurer" },
  { name: "Starlight", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Starlight", category: "adventurer" },
  { name: "Bella Chic", url: "https://api.dicebear.com/7.x/micah/svg?seed=Bella", category: "adventurer" },
  { name: "Leo Cool", url: "https://api.dicebear.com/7.x/micah/svg?seed=Leo", category: "adventurer" },
  { name: "Zoe Glow", url: "https://api.dicebear.com/7.x/micah/svg?seed=Zoe", category: "adventurer" },

  // 4. Emojis & Doodles
  { name: "Heart Eyes", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Heart", category: "emoji" },
  { name: "Love Kiss", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Kiss", category: "emoji" },
  { name: "Cute Wink", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Wink", category: "emoji" },
  { name: "Blushing Cutie", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Blush", category: "emoji" },
  { name: "Sweet Smile", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Smile", category: "emoji" },
  { name: "Cupid Doodle", url: "https://api.dicebear.com/7.x/croodles/svg?seed=Cupid", category: "emoji" },
  { name: "Heart Doodle", url: "https://api.dicebear.com/7.x/croodles/svg?seed=LoveDoodle", category: "emoji" },
  { name: "Love Bot", url: "https://api.dicebear.com/7.x/bottts/svg?seed=LoveBot", category: "emoji" },
  { name: "Cute Robot", url: "https://api.dicebear.com/7.x/bottts/svg?seed=CuteBot", category: "emoji" },

  // 5. Classic Avatars
  { name: "Handsome Sanket", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=sanket", category: "classic" },
  { name: "Romantic Priya", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=priya", category: "classic" },
  { name: "Cool Rahul", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=rahul", category: "classic" },
  { name: "Cute Emma", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=emma", category: "classic" },
  { name: "Prince Lucas", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=lucas", category: "classic" },
  { name: "Princess Sophia", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=sophia", category: "classic" },
];

const MOOD_PRESETS = [
  "In love 🥰",
  "Missing you ❤️",
  "Always thinking of you 💭",
  "Ready to chat 💬",
  "Listening to music 🎶",
  "Happy & smiling ✨",
  "Busy working 💻",
  "Can't wait to see you 🌹",
];

export default function ProfileEditModal({
  isOpen,
  onClose,
  currentUser,
  onSaveProfile,
}: ProfileEditModalProps) {
  const [name, setName] = useState(currentUser.name || "");
  const [username, setUsername] = useState(currentUser.username || "");
  const [avatar, setAvatar] = useState(currentUser.avatar || "");
  const [mood, setMood] = useState(currentUser.mood || "In love 🥰");
  const [selectedCategory, setSelectedCategory] = useState<"cuties" | "anime" | "adventurer" | "emoji" | "classic">("cuties");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleRandomCuteAvatar = () => {
    const randomSeeds = ["cutie", "sweetie", "angel", "honey", "blossom", "sparkle", "marshmallow", "mochi", "sugar", "candy", "sunshine", "baby"];
    const randomSeed = randomSeeds[Math.floor(Math.random() * randomSeeds.length)] + "_" + Math.floor(Math.random() * 9999);
    const styles = ["big-ears", "lorelei", "adventurer", "fun-emoji"];
    const style = styles[Math.floor(Math.random() * styles.length)];
    setAvatar(`https://api.dicebear.com/7.x/${style}/svg?seed=${randomSeed}`);
  };

  const filteredAvatars = CUTE_AVATARS.filter((a) => a.category === selectedCategory);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your display name");
      return;
    }
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-zA-Z0-9_]/g, "");

    setIsSaving(true);
    setError("");

    try {
      await onSaveProfile({
        name: name.trim(),
        username: cleanUsername,
        avatar: avatar || `https://api.dicebear.com/7.x/big-ears/svg?seed=${cleanUsername}`,
        mood: mood.trim() || "In love 🥰",
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg glass-panel-glow rounded-3xl p-5 sm:p-6 border border-usly-pink/40 shadow-2xl relative overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-usly-pink/20 flex items-center justify-center text-usly-pink">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Edit Profile & Cute Avatar</h3>
              <p className="text-[11px] text-zinc-400">Choose cute avatars, customized name, and romantic status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs text-center flex-shrink-0">
            {error}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* Active Avatar Preview & Randomizer */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="relative group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-love p-1 shadow-xl shadow-usly-pink/30">
                <img
                  src={avatar || `https://api.dicebear.com/7.x/big-ears/svg?seed=${username || "user"}`}
                  alt={name}
                  className="w-full h-full rounded-full bg-usly-dark object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleRandomCuteAvatar}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-love hover:opacity-95 flex items-center justify-center shadow-lg border-2 border-usly-dark text-white active:scale-90 transition"
                title="Generate Random Cute Avatar"
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleRandomCuteAvatar}
                className="text-[11px] font-bold text-usly-coral hover:text-white transition flex items-center space-x-1 px-3 py-1 rounded-full bg-usly-pink/15 border border-usly-pink/30"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>Surprise Cute Avatar</span>
              </button>
            </div>
          </div>

          {/* Avatar Categories Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                Select Cute Avatar Style ({CUTE_AVATARS.length} Available)
              </label>
            </div>

            {/* Category Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              {[
                { id: "cuties", label: "🌸 Cuties", count: 9 },
                { id: "anime", label: "💕 Anime", count: 9 },
                { id: "adventurer", label: "👑 Royals", count: 9 },
                { id: "emoji", label: "🥰 Emojis", count: 9 },
                { id: "classic", label: "✨ Classic", count: 6 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition text-xs ${
                    selectedCategory === tab.id
                      ? "bg-gradient-love text-white shadow-md shadow-usly-pink/30"
                      : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Avatar Presets Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 p-2 rounded-2xl bg-black/30 border border-white/5 max-h-48 overflow-y-auto">
              {filteredAvatars.map((preset) => {
                const isSelected = avatar === preset.url;
                return (
                  <button
                    key={preset.name + preset.url}
                    type="button"
                    onClick={() => setAvatar(preset.url)}
                    className={`relative rounded-2xl p-2 border transition active:scale-95 flex flex-col items-center space-y-1 ${
                      isSelected
                        ? "bg-usly-pink/30 border-usly-pink ring-2 ring-usly-pink shadow-md shadow-usly-pink/30"
                        : "bg-usly-surface/90 border-white/10 hover:border-usly-pink/40"
                    }`}
                    title={preset.name}
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-12 h-12 rounded-full object-cover bg-usly-dark/60 p-0.5"
                    />
                    <span className="text-[10px] text-zinc-300 font-medium truncate w-full text-center">
                      {preset.name}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-usly-pink flex items-center justify-center text-white shadow-md">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sanket"
              required
              className="w-full bg-usly-surface border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-usly-pink transition font-semibold"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Username Handle (@)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs sm:text-sm text-zinc-400 font-mono">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sanketmaru67"
                required
                className="w-full bg-usly-surface border border-white/10 rounded-2xl pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-usly-pink transition font-mono"
              />
            </div>
          </div>

          {/* Mood / Status */}
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Your Mood / Status</span>
              <span className="text-[10px] text-pink-300">Visible to friends</span>
            </label>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="e.g. In love 🥰"
              className="w-full bg-usly-surface border border-white/10 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-usly-pink transition font-medium mb-2"
            />

            {/* Quick Mood Pills */}
            <div className="flex flex-wrap gap-1.5">
              {MOOD_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(m)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition active:scale-95 ${
                    mood === m
                      ? "bg-usly-pink/30 border-usly-pink text-white"
                      : "bg-white/5 border-white/10 text-zinc-300 hover:border-white/20"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl bg-gradient-love hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-usly-pink/30 transition active:scale-95 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? "Saving Profile..." : "Save Profile & Avatar"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
