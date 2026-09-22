"use client";

import React, { useState } from "react";
import { X, Check, Camera, Sparkles, Heart, User, Smile, Shield } from "lucide-react";

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

// Preset visual avatar seeds
const AVATAR_PRESETS = [
  { name: "Handsome", seed: "sanket" },
  { name: "Sweetheart", seed: "sweetheart" },
  { name: "Angel", seed: "alexa" },
  { name: "Romantic", seed: "priya" },
  { name: "Cool Boy", seed: "rahul" },
  { name: "Cute Girl", seed: "emma" },
  { name: "Prince", seed: "maru" },
  { name: "Princess", seed: "sophia" },
  { name: "Charming", seed: "lucas" },
  { name: "Love Bird", seed: "olivia" },
  { name: "Vibes", seed: "leo" },
  { name: "Star", seed: "maya" },
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSelectPresetAvatar = (seed: string) => {
    setAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`);
  };

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
        avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
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
      <div className="w-full max-w-md glass-panel-glow rounded-3xl p-5 sm:p-6 border border-usly-pink/40 shadow-2xl relative overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-usly-pink/20 flex items-center justify-center text-usly-pink">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Edit Your Profile</h3>
              <p className="text-[11px] text-zinc-400">Customize your avatar, name, and romantic mood</p>
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
          {/* Active Avatar Preview */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="relative group">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-love p-1 shadow-xl shadow-usly-pink/30">
                <img
                  src={avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username || "user"}`}
                  alt={name}
                  className="w-full h-full rounded-full bg-usly-dark object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-usly-pink flex items-center justify-center shadow-lg border-2 border-usly-dark text-white">
                <Camera className="w-3.5 h-3.5" />
              </div>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">Tap an avatar below to switch</span>
          </div>

          {/* Avatar Presets Grid */}
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Choose Avatar Style
            </label>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_PRESETS.map((preset) => {
                const presetUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${preset.seed}`;
                const isSelected = avatar === presetUrl;
                return (
                  <button
                    key={preset.seed}
                    type="button"
                    onClick={() => handleSelectPresetAvatar(preset.seed)}
                    className={`relative rounded-2xl p-1 border transition active:scale-95 flex flex-col items-center ${
                      isSelected
                        ? "bg-usly-pink/30 border-usly-pink ring-2 ring-usly-pink"
                        : "bg-usly-surface border-white/10 hover:border-white/30"
                    }`}
                    title={preset.name}
                  >
                    <img
                      src={presetUrl}
                      alt={preset.name}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-usly-pink flex items-center justify-center text-white">
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
              <span>{isSaving ? "Saving Profile..." : "Save Profile"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
