import React from "react";

export type ChatThemeId = "sunset" | "cyber" | "rose";

export interface ChatTheme {
  id: ChatThemeId;
  name: string;
  icon: string;
  tagline: string;
  previewGradient: string;
  chatBgClass: string;
  chatBg?: string;
  accentColor: string;
  sentStyle: React.CSSProperties;
  partnerStyle: React.CSSProperties;
  chatBgStyle: React.CSSProperties;
}

export const CHAT_THEMES: Record<ChatThemeId, ChatTheme> = {
  sunset: {
    id: "sunset",
    name: "Instagram Sunset",
    icon: "🌅",
    tagline: "Classic Instagram purple-to-berry gradient",
    previewGradient: "from-[#8a3ab9] via-[#e95950] to-[#bc2a8d]",
    chatBgClass: "bg-radial-sunset",
    chatBg: "bg-radial-sunset",
    accentColor: "#E1306C",
    sentStyle: {
      background: "linear-gradient(135deg, #7B2CBF 0%, #C77DFF 45%, #FF007F 100%)",
      color: "#ffffff",
      boxShadow: "0 4px 16px rgba(255, 0, 127, 0.28)",
    },
    partnerStyle: {
      backgroundColor: "#262626",
      color: "#ffffff",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
    },
    chatBgStyle: {
      backgroundColor: "#0d0614",
    },
  },
  cyber: {
    id: "cyber",
    name: "Neon Cyber",
    icon: "⚡",
    tagline: "Electric cyan, ocean blue & purple glow",
    previewGradient: "from-[#00F0FF] via-[#7000FF] to-[#FF007F]",
    chatBgClass: "bg-radial-cyber",
    chatBg: "bg-radial-cyber",
    accentColor: "#00F0FF",
    sentStyle: {
      background: "linear-gradient(135deg, #00C9FF 0%, #7000FF 50%, #FF007F 100%)",
      color: "#ffffff",
      boxShadow: "0 4px 16px rgba(0, 201, 255, 0.3)",
    },
    partnerStyle: {
      backgroundColor: "#161c28",
      color: "#ffffff",
      border: "1px solid rgba(0, 240, 255, 0.25)",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
    },
    chatBgStyle: {
      backgroundColor: "#050912",
    },
  },
  rose: {
    id: "rose",
    name: "Rose Velvet",
    icon: "🌹",
    tagline: "Warm couple romance with ruby & coral tones",
    previewGradient: "from-[#FF0844] via-[#FF4E50] to-[#F857A6]",
    chatBgClass: "bg-radial-rose",
    chatBg: "bg-radial-rose",
    accentColor: "#FF2A6D",
    sentStyle: {
      background: "linear-gradient(135deg, #E11D48 0%, #F43F5E 50%, #FB7185 100%)",
      color: "#ffffff",
      boxShadow: "0 4px 16px rgba(225, 29, 72, 0.3)",
    },
    partnerStyle: {
      backgroundColor: "#25131b",
      color: "#ffffff",
      border: "1px solid rgba(244, 63, 94, 0.25)",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
    },
    chatBgStyle: {
      backgroundColor: "#11050a",
    },
  },
};

export const DEFAULT_THEME_ID: ChatThemeId = "sunset";
