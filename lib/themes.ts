export type ChatThemeId = "sunset" | "cyber" | "rose";

export interface ChatTheme {
  id: ChatThemeId;
  name: string;
  icon: string;
  tagline: string;
  previewGradient: string;
  chatBg: string;
  sentBubble: string;
  partnerBubble: string;
  accentColor: string;
  headerBorder: string;
  inputBg: string;
  ringColor: string;
}

export const CHAT_THEMES: Record<ChatThemeId, ChatTheme> = {
  sunset: {
    id: "sunset",
    name: "Instagram Sunset",
    icon: "🌅",
    tagline: "Classic Instagram purple-to-berry gradient",
    previewGradient: "from-[#8a3ab9] via-[#e95950] to-[#bc2a8d]",
    chatBg: "bg-[#0b0512] bg-radial-sunset",
    sentBubble: "bg-gradient-to-r from-[#6A11CB] via-[#B827FC] to-[#FF416C] text-white shadow-lg shadow-purple-900/30",
    partnerBubble: "bg-[#262626] text-white border border-white/10 shadow-md",
    accentColor: "#E1306C",
    headerBorder: "border-purple-500/20",
    inputBg: "bg-[#262626]",
    ringColor: "ring-pink-500",
  },
  cyber: {
    id: "cyber",
    name: "Neon Cyber",
    icon: "⚡",
    tagline: "Electric cyan, ocean blue & purple glow",
    previewGradient: "from-[#00F0FF] via-[#7000FF] to-[#FF007F]",
    chatBg: "bg-[#050811] bg-radial-cyber",
    sentBubble: "bg-gradient-to-r from-[#00C9FF] via-[#92FE9D] to-[#8E2DE2] text-white shadow-lg shadow-cyan-900/30",
    partnerBubble: "bg-[#161c28] text-white border border-cyan-500/20 shadow-md",
    accentColor: "#00F0FF",
    headerBorder: "border-cyan-500/20",
    inputBg: "bg-[#161c28]",
    ringColor: "ring-cyan-400",
  },
  rose: {
    id: "rose",
    name: "Rose Velvet",
    icon: "🌹",
    tagline: "Warm couple romance with ruby & coral tones",
    previewGradient: "from-[#FF0844] via-[#FF4E50] to-[#F857A6]",
    chatBg: "bg-[#11050a] bg-radial-rose",
    sentBubble: "bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#FB7185] text-white shadow-lg shadow-rose-900/30",
    partnerBubble: "bg-[#25131b] text-white border border-rose-500/20 shadow-md",
    accentColor: "#FF2A6D",
    headerBorder: "border-rose-500/20",
    inputBg: "bg-[#25131b]",
    ringColor: "ring-rose-500",
  },
};

export const DEFAULT_THEME_ID: ChatThemeId = "sunset";
