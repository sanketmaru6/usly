export interface PingOption {
  id: "love_you" | "miss_you" | "kiss" | "hug" | "thinking_of_you" | "nudge";
  title: string;
  subtitle: string;
  icon: string;
  previewText: string;
  messageContent: string;
  color: string;
  badgeGradient: string;
  borderColor: string;
  glowColor: string;
  textColor: string;
  emojis: string[];
  soundType: "love" | "chime" | "crystal" | "heartbeat" | "pop";
}

export const PING_OPTIONS: PingOption[] = [
  {
    id: "love_you",
    title: "Love You",
    subtitle: "I love you forever & always",
    icon: "💖",
    previewText: "💖 Sent a Love You Ping!",
    messageContent: "💖 Sent a Love You Ping! • I love you forever & always! 💕",
    color: "from-pink-500 to-rose-600",
    badgeGradient: "from-pink-500/20 via-rose-500/20 to-purple-600/20",
    borderColor: "border-pink-500/40",
    glowColor: "shadow-pink-500/20",
    textColor: "text-pink-200",
    emojis: ["💖", "❤️", "💕", "💘", "🥰", "💓", "✨"],
    soundType: "love",
  },
  {
    id: "miss_you",
    title: "Miss You",
    subtitle: "Missing you so much right now",
    icon: "🥺",
    previewText: "🥺 Sent a Miss You Ping!",
    messageContent: "🥺 Sent a Miss You Ping! • Missing you like crazy! 💭",
    color: "from-indigo-500 to-purple-600",
    badgeGradient: "from-indigo-500/20 via-purple-500/20 to-pink-500/20",
    borderColor: "border-indigo-400/40",
    glowColor: "shadow-indigo-500/20",
    textColor: "text-indigo-200",
    emojis: ["🥺", "💭", "🌧️", "💜", "✨", "💌", "🫂"],
    soundType: "crystal",
  },
  {
    id: "kiss",
    title: "Sweet Kiss",
    subtitle: "Muah! Sending a warm sweet kiss",
    icon: "💋",
    previewText: "💋 Sent a Sweet Kiss Ping!",
    messageContent: "💋 Sent a Sweet Kiss Ping! • Muah! Sending a sweet kiss 💋",
    color: "from-rose-500 to-red-600",
    badgeGradient: "from-rose-500/20 via-red-500/20 to-pink-600/20",
    borderColor: "border-rose-400/40",
    glowColor: "shadow-rose-500/20",
    textColor: "text-rose-200",
    emojis: ["💋", "💄", "😘", "❤️", "🌹", "✨"],
    soundType: "pop",
  },
  {
    id: "hug",
    title: "Warm Hug",
    subtitle: "Sending the biggest warmest hug",
    icon: "🫂",
    previewText: "🫂 Sent a Warm Hug Ping!",
    messageContent: "🫂 Sent a Warm Hug Ping! • Sending you a big warm hug! 🫂✨",
    color: "from-amber-500 to-orange-600",
    badgeGradient: "from-amber-500/20 via-orange-500/20 to-rose-500/20",
    borderColor: "border-amber-400/40",
    glowColor: "shadow-amber-500/20",
    textColor: "text-amber-200",
    emojis: ["🫂", "🧸", "🧡", "✨", "🌸", "☀️"],
    soundType: "heartbeat",
  },
  {
    id: "thinking_of_you",
    title: "Thinking of You",
    subtitle: "Can't get you out of my mind",
    icon: "💭",
    previewText: "💭 Sent a Thinking of You Ping!",
    messageContent: "💭 Sent a Thinking of You Ping! • Always on my mind & in my heart ✨",
    color: "from-violet-500 to-fuchsia-600",
    badgeGradient: "from-violet-500/20 via-fuchsia-500/20 to-pink-500/20",
    borderColor: "border-violet-400/40",
    glowColor: "shadow-violet-500/20",
    textColor: "text-violet-200",
    emojis: ["💭", "✨", "🌙", "⭐", "💜", "🌸"],
    soundType: "crystal",
  },
  {
    id: "nudge",
    title: "Wake Up / Nudge",
    subtitle: "Hey sleeping beauty, wake up!",
    icon: "⚡",
    previewText: "⚡ Sent a Wake Up / Nudge Ping!",
    messageContent: "⚡ Sent a Nudge Ping! • Hey! Wake up & check your phone ⚡🔔",
    color: "from-yellow-400 to-amber-500",
    badgeGradient: "from-yellow-400/20 via-amber-500/20 to-orange-500/20",
    borderColor: "border-yellow-400/40",
    glowColor: "shadow-yellow-400/20",
    textColor: "text-yellow-200",
    emojis: ["⚡", "🔔", "⏰", "☀️", "👀", "✨"],
    soundType: "love",
  },
];

export function getPingOptionFromContent(content: string = ""): PingOption {
  const lower = (content || "").toLowerCase();
  if (lower.includes("miss you") || lower.includes("missing")) {
    return PING_OPTIONS.find((p) => p.id === "miss_you") || PING_OPTIONS[1];
  }
  if (lower.includes("kiss") || lower.includes("muah")) {
    return PING_OPTIONS.find((p) => p.id === "kiss") || PING_OPTIONS[2];
  }
  if (lower.includes("hug")) {
    return PING_OPTIONS.find((p) => p.id === "hug") || PING_OPTIONS[3];
  }
  if (lower.includes("thinking")) {
    return PING_OPTIONS.find((p) => p.id === "thinking_of_you") || PING_OPTIONS[4];
  }
  if (lower.includes("nudge") || lower.includes("wake up")) {
    return PING_OPTIONS.find((p) => p.id === "nudge") || PING_OPTIONS[5];
  }
  return PING_OPTIONS[0]; // default love_you
}
