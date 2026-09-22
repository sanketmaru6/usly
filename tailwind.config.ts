import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        usly: {
          pink: "#FF4B72",
          rose: "#FF6584",
          crimson: "#FF2E63",
          coral: "#FB7185",
          purple: "#9333EA",
          violet: "#7C3AED",
          lavender: "#C084FC",
          gold: "#F59E0B",
          dark: "#090410",
          card: "#140A24",
          surface: "#1D0F33",
          border: "rgba(255, 75, 114, 0.15)",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-love": "linear-gradient(135deg, #FF4B72 0%, #9333EA 100%)",
        "gradient-romantic": "linear-gradient(135deg, #FF6584 0%, #7C3AED 50%, #3B82F6 100%)",
        "gradient-glow": "radial-gradient(circle at 50% 0%, rgba(255, 75, 114, 0.25), transparent 70%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 4s ease-in-out infinite",
        "heartbeat": "heartbeat 1.5s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "shimmer": "shimmer 2.5s infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "14%": { transform: "scale(1.15)" },
          "28%": { transform: "scale(1)" },
          "42%": { transform: "scale(1.15)" },
          "70%": { transform: "scale(1)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 15px rgba(255, 75, 114, 0.3)" },
          "100%": { boxShadow: "0 0 30px rgba(255, 75, 114, 0.7), 0 0 45px rgba(147, 51, 234, 0.5)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        }
      },
    },
  },
  plugins: [],
};
export default config;
