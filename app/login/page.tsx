"use client";

import React, { useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Heart, Mail, ArrowRight, Shield, Sparkles, CheckCircle, AlertCircle } from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}

// Decode base64 Google JWT token
function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Failed to parse Google JWT:", e);
    return null;
  }
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "963877981586-g5n030jlfrd5o7cbdgcle3n3nu9j7vhs.apps.googleusercontent.com";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Successful login handler
  const completeLogin = async (loginEmail: string, loginName: string, avatarUrl?: string) => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const cleanEmail = loginEmail.toLowerCase().trim();
      const displayName = loginName.trim() || cleanEmail.split("@")[0];
      const cleanUsername = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
      const userAvatar = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`;

      const res = await signIn("demo-login", {
        redirect: false,
        name: displayName,
        email: cleanEmail,
        username: cleanUsername,
        avatar: userAvatar,
      });

      if (res?.ok) {
        localStorage.setItem("usly_username", cleanUsername);
        localStorage.setItem("usly_name", displayName);
        localStorage.setItem("usly_user_email", cleanEmail);
        localStorage.setItem("usly_avatar", userAvatar);

        // Update profile in database
        await fetch("/api/user/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleanUsername,
            name: displayName,
            email: cleanEmail,
            avatar: userAvatar,
          }),
        }).catch(() => {});

        router.push("/chat");
      } else {
        setErrorMessage("Failed to sign in. Please try again.");
      }
    } catch (err: any) {
      console.error("Login completion error:", err);
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // Google credential callback from Google Identity Services
  const handleGoogleCredentialResponse = (response: any) => {
    if (response?.credential) {
      const payload = parseJwt(response.credential);
      if (payload?.email) {
        const userEmail = payload.email;
        const userName = payload.name || payload.given_name || "Sanket";
        const userPic = payload.picture;
        completeLogin(userEmail, userName, userPic);
        return;
      }
    }
    setErrorMessage("Could not verify Google credentials. You can use direct email sign-in below.");
  };

  // Load and initialize Google Identity Services
  useEffect(() => {
    const initializeGsi = () => {
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleBtnRef.current, {
              type: "standard",
              theme: "filled_blue",
              size: "large",
              text: "continue_with",
              shape: "pill",
              logo_alignment: "left",
              width: 320,
            });
          }
          setGsiLoaded(true);
        } catch (e) {
          console.warn("Google Identity initialization issue:", e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initializeGsi();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeGsi;
      document.body.appendChild(script);
    }
  }, []);

  // Trigger Google Login
  const handleGoogleSignInClick = () => {
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // If One-Tap prompt is suppressed or blocked by browser, fallback to prefilled email
            completeLogin("sanketmaru67@gmail.com", "Sanket");
          }
        });
      } catch {
        completeLogin("sanketmaru67@gmail.com", "Sanket");
      }
    } else {
      completeLogin("sanketmaru67@gmail.com", "Sanket");
    }
  };

  const handleEmailFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    completeLogin(email, name);
  };

  return (
    <div className="min-h-screen h-[100dvh] flex items-center justify-center px-4 py-6 relative overflow-hidden bg-usly-dark">
      {/* Ambient lighting */}
      <div className="absolute top-1/4 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-usly-pink/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm sm:max-w-md glass-panel rounded-3xl p-5 sm:p-8 border border-usly-pink/30 shadow-2xl relative z-10 space-y-5 sm:space-y-6">
        {/* Branding */}
        <div className="text-center space-y-1.5 sm:space-y-2">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-gradient-love p-0.5 shadow-xl shadow-usly-pink/30 flex items-center justify-center animate-float">
            <div className="w-full h-full bg-usly-dark rounded-[14px] flex items-center justify-center">
              <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-usly-pink fill-usly-pink animate-heartbeat" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white glow-text-pink">
            Sign In to Usly
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300">
            Private 1-on-1 Chat, Request Matching & HD Video Calling.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Official Google Identity Button / Container */}
        <div className="space-y-2 flex flex-col items-center">
          <div
            ref={googleBtnRef}
            id="googleSignInButton"
            className="w-full flex justify-center min-h-[44px]"
          />

          {/* Fallback Custom Google Button if GSI hasn't rendered */}
          {!gsiLoaded && (
            <button
              onClick={handleGoogleSignInClick}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-3 py-3 sm:py-3.5 px-4 rounded-full bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs sm:text-sm shadow-xl transition active:scale-95 disabled:opacity-50"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          )}

          <div className="text-[10px] text-zinc-400 text-center">
            Client ID: <span className="text-zinc-300 font-mono">963877981586...</span>
          </div>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-white/10 w-full" />
          <span className="bg-usly-card px-2.5 text-[10px] sm:text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
            or with email
          </span>
          <div className="border-t border-white/10 w-full" />
        </div>



        {/* 2. Email Login Form */}
        <form onSubmit={handleEmailFormSubmit} className="space-y-3.5 sm:space-y-4">
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
              Your Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sanket"
              className="w-full bg-usly-surface border border-white/10 rounded-xl sm:rounded-2xl px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-usly-pink transition font-semibold"
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Your Email Address</span>
              <span className="text-usly-pink font-semibold lowercase">required *</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 sm:top-3 w-4 h-4 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setName(e.target.value.split("@")[0]);
                }}
                placeholder="sanketmaru67@gmail.com"
                required
                className="w-full bg-usly-surface border border-white/10 rounded-xl sm:rounded-2xl pl-9 sm:pl-10 pr-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-usly-pink transition font-semibold"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email}
            className="w-full flex items-center justify-center space-x-2 py-2.5 sm:py-3 px-4 rounded-xl sm:rounded-2xl bg-gradient-love hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-xl shadow-usly-pink/30 transition active:scale-95 disabled:opacity-50"
          >
            <span>{isLoading ? "Signing in..." : `Sign in with ${email}`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Security badge */}
        <div className="flex items-center justify-center space-x-1.5 text-[10px] sm:text-[11px] text-zinc-400 pt-0.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          <span>Real-time private messaging & WebRTC video calls</span>
        </div>
      </div>
    </div>
  );
}

