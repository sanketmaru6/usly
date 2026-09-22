"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  Square,
  Smile,
  Sparkles,
  Heart,
  Volume2,
  VolumeX,
  Check,
  Image as ImageIcon,
  X,
  Loader2,
} from "lucide-react";
import { soundFX } from "@/lib/webrtc";

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: "text" | "voice" | "image" | "sticker" | "love_ping",
    audioDuration?: number
  ) => void;
  onSendLovePing: () => void;
  onTyping?: (isTyping: boolean) => void;
}

const ROMANTIC_STICKERS = ["🧸", "💋", "🌹", "💍", "🍫", "💌", "🕊️", "🥂", "🍓", "💫", "✨", "🔥"];

const LOVE_QUESTIONS = [
  "What made you fall in love with me? 💕",
  "What is your favorite memory of us together? ✨",
  "If we could teleport right now, where would we go? ✈️",
  "What is one cute habit of mine that you love? 🥰",
  "Describe our love in three words! 💖",
];

const CHAT_SOUND_OPTIONS = [
  { id: "chime", name: "Romantic Chime", icon: "🔔", desc: "Gentle 4-note chord (Default)" },
  { id: "pop", name: "Bubble Pop", icon: "🫧", desc: "Soft subtle pop (WhatsApp style)" },
  { id: "crystal", name: "Sweet Crystal", icon: "✨", desc: "Sparkling bell chime" },
  { id: "heartbeat", name: "Heartbeat", icon: "💖", desc: "Warm gentle pulse" },
  { id: "silent", name: "Mute / Silent", icon: "🔕", desc: "No sound during chat" },
];

export default function MessageInput({
  onSendMessage,
  onSendLovePing,
  onTyping,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string>("chime");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const soundMenuRef = useRef<HTMLDivElement | null>(null);

  // Load persisted chat sound choice
  useEffect(() => {
    const saved = localStorage.getItem("usly_chat_sound") || "chime";
    setSelectedSound(saved);
  }, []);

  // Close sound menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (soundMenuRef.current && !soundMenuRef.current.contains(e.target as Node)) {
        setShowSoundMenu(false);
      }
    };
    if (showSoundMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSoundMenu]);

  // Compress and convert image to lightweight Data URL (Max 1600px, 82% quality)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(readerEvent.target?.result as string);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = readerEvent.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (JPG, PNG, WebP, GIF).");
      return;
    }

    try {
      setIsProcessingImage(true);
      const compressedDataUrl = await compressImage(file);
      setSelectedImage(compressedDataUrl);
    } catch (err) {
      console.error("Image processing error:", err);
      alert("Failed to process the image. Please try another photo.");
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Support pasting image from clipboard (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          try {
            setIsProcessingImage(true);
            const compressedDataUrl = await compressImage(file);
            setSelectedImage(compressedDataUrl);
          } catch (err) {
            console.error("Paste image error:", err);
          } finally {
            setIsProcessingImage(false);
          }
          break;
        }
      }
    }
  };

  const handleSelectSound = (soundId: string) => {
    setSelectedSound(soundId);
    localStorage.setItem("usly_chat_sound", soundId);
    if (soundId !== "silent") {
      soundFX.playChatSound(soundId);
    }
    setTimeout(() => setShowSoundMenu(false), 250);
  };

  const handleSend = () => {
    // 1. Send image if selected
    if (selectedImage) {
      onSendMessage(selectedImage, "image");
      setSelectedImage(null);
    }

    // 2. Send text message if present
    if (text.trim()) {
      onSendMessage(text.trim(), "text");
      setText("");
    }

    setShowStickers(false);
    setShowSoundMenu(false);
    if (onTyping) onTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (onTyping) {
      onTyping(e.target.value.length > 0);
    }
  };

  // Voice Recording Feature
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          onSendMessage(base64Audio, "voice", recordSeconds || 3);
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordSeconds(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Please allow microphone access to record voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
      }
    }
  };

  const handleSendSticker = (sticker: string) => {
    onSendMessage(sticker, "sticker");
    setShowStickers(false);
  };

  const handleSendRandomQuestion = () => {
    const q = LOVE_QUESTIONS[Math.floor(Math.random() * LOVE_QUESTIONS.length)];
    onSendMessage(q, "text");
    setShowStickers(false);
  };

  return (
    <div className="relative p-2 sm:p-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] glass-panel border-t border-white/10 flex-shrink-0">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Selected Image Preview Drawer */}
      {selectedImage && (
        <div className="absolute bottom-full left-2 right-2 mb-2 p-3 rounded-2xl bg-zinc-950/95 border border-usly-pink/40 backdrop-blur-2xl shadow-2xl flex items-center justify-between z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-usly-pink/50 shadow-md flex-shrink-0 bg-black">
              <img
                src={selectedImage}
                alt="Upload preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Photo Ready to Send 📸</span>
              <span className="text-[10px] text-zinc-400 block truncate">
                Add a message below or tap Send
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setSelectedImage(null)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition active:scale-90"
              title="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSend}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-love text-white text-xs font-bold shadow-md shadow-usly-pink/30 hover:opacity-95 transition active:scale-90 flex items-center space-x-1"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* Sticker & Love Questions Popover */}
      {showStickers && (
        <div className="absolute bottom-full left-2 right-2 mb-2 glass-panel-glow rounded-2xl p-3 sm:p-4 shadow-2xl border border-usly-pink/30 animate-in fade-in slide-in-from-bottom-2 duration-150 z-30 bg-zinc-950/95 backdrop-blur-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs font-bold text-usly-coral uppercase tracking-wider">
              Romantic Stickers
            </span>
            <button
              onClick={handleSendRandomQuestion}
              className="text-[10px] sm:text-[11px] flex items-center space-x-1 px-2.5 py-1 rounded-full bg-usly-pink/20 hover:bg-usly-pink/30 text-pink-200 border border-usly-pink/40 transition"
            >
              <Sparkles className="w-3 h-3 text-usly-pink" />
              <span>Ask Question</span>
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1.5 sm:gap-2 text-xl sm:text-2xl py-1">
            {ROMANTIC_STICKERS.map((sticker) => (
              <button
                key={sticker}
                onClick={() => handleSendSticker(sticker)}
                className="hover:scale-125 transition-transform p-1.5 rounded-xl hover:bg-white/10 flex items-center justify-center"
              >
                {sticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input controls container */}
      <div className="flex items-center space-x-1.5 sm:space-x-2">
        {/* Stickers / Emojis Button */}
        <button
          type="button"
          onClick={() => {
            setShowStickers(!showStickers);
            setShowSoundMenu(false);
          }}
          className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl transition border flex-shrink-0 active:scale-90 ${
            showStickers
              ? "bg-usly-pink text-white border-usly-pink"
              : "bg-usly-surface/80 hover:bg-usly-surface text-zinc-300 border-white/10"
          }`}
          title="Stickers"
        >
          <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Image / Photo Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingImage}
          className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-usly-surface/80 hover:bg-usly-surface text-sky-300 hover:text-white border border-white/10 transition active:scale-90 flex-shrink-0"
          title="Send Photo / Image"
        >
          {isProcessingImage ? (
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-sky-400" />
          ) : (
            <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>

        {/* Love Ping Quick Buzzer */}
        <button
          type="button"
          onClick={onSendLovePing}
          className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-usly-pink/15 hover:bg-usly-pink/30 text-usly-pink border border-usly-pink/30 transition active:scale-90 flex-shrink-0"
          title="Love Ping"
        >
          <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-usly-pink animate-heartbeat" />
        </button>

        {/* Text Input / Recording State */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl sm:rounded-2xl bg-red-950/40 border border-red-500/30 text-red-300 animate-pulse min-w-0">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping flex-shrink-0" />
              <span className="text-xs sm:text-xs font-bold truncate">Recording ({recordSeconds}s)</span>
            </div>
            <button
              onClick={stopRecording}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-bold shadow-md hover:bg-red-600 transition active:scale-90 flex-shrink-0 ml-1"
            >
              <Square className="w-3 h-3 fill-white" />
              <span>Send</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 relative min-w-0">
            <input
              type="text"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedImage ? "Add a caption with your photo..." : "Message..."}
              className="w-full bg-usly-surface/90 border border-white/10 focus:border-usly-pink/60 rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-base sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-usly-pink/30 transition font-medium"
            />
          </div>
        )}

        {/* ── Live Chat Sound Setting Button ── */}
        {!isRecording && (
          <div className="relative flex-shrink-0" ref={soundMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowSoundMenu(!showSoundMenu);
                setShowStickers(false);
              }}
              className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border transition active:scale-90 flex items-center justify-center ${
                selectedSound === "silent"
                  ? "bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25"
                  : "bg-usly-surface/80 hover:bg-usly-purple/20 text-purple-300 hover:text-white border-white/10"
              }`}
              title={
                selectedSound === "silent"
                  ? "Live Chat Sound: Muted (Click to change)"
                  : `Live Chat Sound: ${CHAT_SOUND_OPTIONS.find((s) => s.id === selectedSound)?.name || selectedSound} (Click to change)`
              }
            >
              {selectedSound === "silent" ? (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-300" />
              )}
            </button>

            {/* Chat Sound Selection Popover */}
            {showSoundMenu && (
              <div className="absolute bottom-full right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 mb-2.5 w-64 glass-panel-glow rounded-2xl p-3 shadow-2xl border border-white/15 animate-in fade-in slide-in-from-bottom-2 duration-150 z-40 bg-zinc-950/95 backdrop-blur-2xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                    <span>🎵 Live Chat Sound</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">Click to preview</span>
                </div>

                <div className="space-y-1">
                  {CHAT_SOUND_OPTIONS.map((opt) => {
                    const isSelected = selectedSound === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectSound(opt.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition active:scale-95 ${
                          isSelected
                            ? "bg-usly-pink/25 border border-usly-pink/50 text-white shadow-sm"
                            : "hover:bg-white/5 border border-transparent text-zinc-300 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-base flex-shrink-0">{opt.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight truncate">{opt.name}</p>
                            <p className="text-[10px] text-zinc-400 leading-tight truncate">{opt.desc}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-usly-pink/30 flex items-center justify-center flex-shrink-0 ml-2">
                            <Check className="w-3.5 h-3.5 text-usly-pink" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mic / Voice Note Button */}
        {!isRecording && !text.trim() && !selectedImage && (
          <button
            type="button"
            onClick={startRecording}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-usly-surface/80 hover:bg-usly-purple/20 text-purple-300 hover:text-white border border-white/10 transition active:scale-90 flex-shrink-0"
            title="Record Voice Note"
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}

        {/* Send Button */}
        {(text.trim() || selectedImage) && (
          <button
            type="button"
            onClick={handleSend}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-love text-white shadow-lg shadow-usly-pink/30 hover:opacity-95 transition active:scale-90 flex-shrink-0"
            title="Send"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
