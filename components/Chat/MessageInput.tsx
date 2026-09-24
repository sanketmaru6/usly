"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Smile,
  Sparkles,
  Heart,
  Image as ImageIcon,
  Camera,
  X,
  Loader2,
} from "lucide-react";
import { soundFX } from "@/lib/webrtc";
import { CHAT_THEMES, ChatThemeId, DEFAULT_THEME_ID } from "@/lib/themes";

interface MessageInputProps {
  onSendMessage: (
    content: string,
    type?: "text" | "voice" | "image" | "sticker" | "love_ping",
    audioDuration?: number
  ) => void;
  onSendLovePing: () => void;
  onTyping?: (isTyping: boolean) => void;
  themeId?: ChatThemeId;
}

const ROMANTIC_STICKERS = ["🧸", "💋", "🌹", "💍", "🍫", "💌", "🕊️", "🥂", "🍓", "💫", "✨", "🔥"];

const LOVE_QUESTIONS = [
  "What made you fall in love with me? 💕",
  "What is your favorite memory of us together? ✨",
  "If we could teleport right now, where would we go? ✈️",
  "What is one cute habit of mine that you love? 🥰",
  "Describe our love in three words! 💖",
];

export default function MessageInput({
  onSendMessage,
  onSendLovePing,
  onTyping,
  themeId = DEFAULT_THEME_ID,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activeTheme = CHAT_THEMES[themeId] || CHAT_THEMES.sunset;

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

  const handleSend = () => {
    if (selectedImage) {
      onSendMessage(selectedImage, "image");
      setSelectedImage(null);
    }
    if (text.trim()) {
      onSendMessage(text.trim(), "text");
      setText("");
    }
    setShowStickers(false);
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

  const hasContentToSend = Boolean(text.trim() || selectedImage);

  return (
    <div className="relative px-2.5 sm:px-4 py-2 sm:py-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] bg-black/95 border-t border-white/10 flex-shrink-0 w-full overflow-hidden">
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
        <div className="absolute bottom-full left-2 right-2 mb-2 p-2.5 rounded-2xl bg-[#1e1e1e] border border-white/15 backdrop-blur-2xl shadow-2xl flex items-center justify-between z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/20 shadow-md flex-shrink-0 bg-black">
              <img
                src={selectedImage}
                alt="Upload preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block truncate">Photo Ready 📸</span>
              <span className="text-[10px] text-zinc-400 block truncate">
                Add text below or tap Send
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setSelectedImage(null)}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition active:scale-90"
              title="Remove photo"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleSend}
              style={activeTheme.sentStyle}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold shadow-md hover:opacity-95 transition active:scale-90 flex items-center space-x-1"
            >
              <span>Send</span>
            </button>
          </div>
        </div>
      )}

      {/* Sticker Popover */}
      {showStickers && (
        <div className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-auto sm:w-80 mb-2 rounded-2xl p-3 shadow-2xl border border-white/15 animate-in fade-in slide-in-from-bottom-2 duration-150 z-30 bg-[#1e1e1e] backdrop-blur-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
              Stickers
            </span>
            <button
              onClick={handleSendRandomQuestion}
              className="text-[10px] flex items-center space-x-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/15 transition"
            >
              <Sparkles className="w-3 h-3 text-pink-400" />
              <span>Ask Question</span>
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1.5 text-xl sm:text-2xl py-1">
            {ROMANTIC_STICKERS.map((sticker) => (
              <button
                key={sticker}
                onClick={() => handleSendSticker(sticker)}
                className="hover:scale-125 transition-transform p-1 rounded-xl hover:bg-white/10 flex items-center justify-center"
              >
                {sticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Instagram-style DM Input Bar */}
      <div className="flex items-center space-x-2 w-full max-w-full">
        {/* Instagram Left Blue Camera Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingImage}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0095F6] hover:bg-[#1877F2] text-white flex-shrink-0 flex items-center justify-center transition shadow-md active:scale-95"
          title="Camera / Photo"
        >
          {isProcessingImage ? (
            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
          ) : (
            <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>

        {/* Central Rounded Capsule Pill */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3.5 py-1.5 sm:py-2 rounded-full bg-red-950/40 border border-red-500/40 text-red-300 animate-pulse min-w-0">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping flex-shrink-0" />
              <span className="text-xs font-bold truncate">Recording ({recordSeconds}s)</span>
            </div>
            <button
              onClick={stopRecording}
              className="flex items-center space-x-1 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-bold shadow-md hover:bg-red-600 transition active:scale-95 flex-shrink-0 ml-1"
            >
              <Square className="w-3 h-3 fill-white" />
              <span>Send</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-center rounded-full bg-[#262626] border border-white/10 px-3.5 py-1.5 sm:py-2 transition focus-within:border-white/30">
            <input
              type="text"
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedImage ? "Caption..." : "Message..."}
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-zinc-400 focus:outline-none font-normal"
            />

            {/* Action icons inside the pill when text is empty */}
            {!hasContentToSend && (
              <div className="flex items-center space-x-1.5 sm:space-x-2 pl-1.5 flex-shrink-0 text-zinc-300">
                {/* Voice Note Button */}
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-1 hover:text-white transition active:scale-95"
                  title="Voice message"
                >
                  <Mic className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Photo Gallery Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 hover:text-white transition active:scale-95"
                  title="Gallery photo"
                >
                  <ImageIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Stickers / Emojis Button */}
                <button
                  type="button"
                  onClick={() => setShowStickers(!showStickers)}
                  className={`p-1 transition active:scale-95 ${
                    showStickers ? "text-pink-400" : "hover:text-white"
                  }`}
                  title="Stickers"
                >
                  <Smile className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>

                {/* Love Ping Heart */}
                <button
                  type="button"
                  onClick={onSendLovePing}
                  className="p-1 text-pink-500 hover:text-pink-400 transition active:scale-95"
                  title="Send Love Ping"
                >
                  <Heart className="w-4 h-4 sm:w-4.5 sm:h-4.5 fill-pink-500 animate-heartbeat" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Instagram "Send" button when user is typing */}
        {!isRecording && hasContentToSend && (
          <button
            type="button"
            onClick={handleSend}
            className="px-2 sm:px-3 py-1.5 font-bold text-sm text-[#0095F6] hover:text-[#1877F2] active:scale-95 transition flex-shrink-0"
            title="Send"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
