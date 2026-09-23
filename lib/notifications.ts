// Comprehensive Notification Manager (System Web Notifications, Haptic Vibration, Audio, In-App Banner)
import { soundFX } from "./webrtc";
import { getPingOptionFromContent } from "./lovePings";

export interface ToastNotification {
  id: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  content: string;
  type: "text" | "voice" | "image" | "love_ping" | "sticker" | "call";
  timestamp: number;
}

class NotificationService {
  private hasRequestedPermission = false;
  private originalTitle = typeof document !== "undefined" ? document.title : "Usly";
  private titleBlinkInterval: NodeJS.Timeout | null = null;
  private ringtoneStopper: (() => void) | null = null;
  private vibrationInterval: NodeJS.Timeout | null = null;
  // Track active call system notification so we can close it on answer/decline
  private activeCallNotification: Notification | null = null;
  private activeRingingCallId: string | null = null;

  // Request browser notification permissions
  async requestPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) return false;

    if (Notification.permission === "granted") return true;

    if (Notification.permission !== "denied" && !this.hasRequestedPermission) {
      this.hasRequestedPermission = true;
      try {
        const res = await Notification.requestPermission();
        return res === "granted";
      } catch {
        return false;
      }
    }
    return false;
  }

  // Show Message Notification
  notifyMessage(
    senderName: string,
    senderUsername: string,
    senderAvatar: string,
    content: string,
    type: "text" | "voice" | "image" | "love_ping" | "sticker" = "text",
    onClick?: () => void
  ) {
    // 1. Play chosen audio chime (or silent if muted)
    soundFX.playChatSound();

    // 2. Mobile Haptic Vibration (WhatsApp-like single buzz)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([80, 40, 80]);
      } catch {}
    }

    // 3. Tab title flash (only when page hidden)
    if (typeof document !== "undefined" && document.hidden) {
      this.flashTitle(`💬 ${senderName}: ${content.slice(0, 30)}`);
    }

    // 4. System Browser Notification (works in background / minimized tabs)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        let displayBody = content;
        if (type === "love_ping") {
          const ping = getPingOptionFromContent(content);
          displayBody = `${ping.icon} Sent you a ${ping.title} Ping!`;
        }
        else if (type === "image") displayBody = "📷 Sent you a photo";
        else if (type === "voice") displayBody = "🎤 Sent you a voice message";
        else if (type === "sticker") displayBody = `✨ Sent a sticker: ${content}`;

        const notif = new Notification(`💬 ${senderName}`, {
          body: displayBody,
          icon: senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderUsername}`,
          badge: "/favicon.ico",
          tag: `msg_${senderUsername}`, // Groups messages from same person
          renotify: true,
          silent: false,
        } as any);

        notif.onclick = () => {
          window.focus();
          if (onClick) onClick();
          notif.close();
        };

        setTimeout(() => notif.close(), 5000);
      } catch (e) {
        console.warn("Browser notification display error:", e);
      }
    }
  }

  // Show Incoming Call Notification with Continuous Ringtone
  notifyIncomingCall(
    callerName: string,
    callerUsername: string,
    callType: "audio" | "video",
    callerAvatar?: string,
    onAnswer?: () => void,
    callId?: string
  ) {
    // Deduplication: If already ringing for this call session, NEVER trigger a 2nd time!
    if (callId && this.activeRingingCallId === callId) {
      return;
    }
    if (callId) {
      this.activeRingingCallId = callId;
    }

    // Stop any previous call notification/ringtone first
    this.stopRingtone(false); // Don't clear activeRingingCallId during internal re-init

    // 1. Start continuous audio ringtone
    this.ringtoneStopper = soundFX.playRingtone();

    // 2. Mobile Continuous Vibration (repeating pattern like WhatsApp)
    this.startRepeatingVibration();

    // 3. Tab title flash
    this.flashTitle(`📞 ${callerName} is calling...`);

    // 4. System Browser Notification (persistent - requireInteraction)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        // Close any existing call notification first
        if (this.activeCallNotification) {
          this.activeCallNotification.close();
          this.activeCallNotification = null;
        }

        const notif = new Notification(
          `📞 Incoming ${callType === "video" ? "Video" : "Voice"} Call`,
          {
            body: `${callerName} is calling you right now! Tap to answer.`,
            icon: callerAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callerUsername}`,
            badge: "/favicon.ico",
            tag: `call_${callerUsername}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
          } as any
        );

        this.activeCallNotification = notif;

        notif.onclick = () => {
          window.focus();
          this.stopRingtone();
          if (onAnswer) onAnswer();
          notif.close();
        };

        notif.onclose = () => {
          if (this.activeCallNotification === notif) {
            this.activeCallNotification = null;
          }
        };
      } catch (e) {
        console.warn("Call notification error:", e);
      }
    }
  }

  stopRingtone(clearCallId: boolean = true) {
    if (clearCallId) {
      this.activeRingingCallId = null;
    }
    // 1. Stop audio immediately
    if (this.ringtoneStopper) {
      this.ringtoneStopper();
      this.ringtoneStopper = null;
    }

    // 2. Stop ALL vibration immediately
    this.stopRepeatingVibration();

    // 3. Reset tab title immediately
    this.resetTitle();

    // 4. Close the system call notification (removes it from tray)
    if (this.activeCallNotification) {
      try {
        this.activeCallNotification.close();
      } catch {}
      this.activeCallNotification = null;
    }

    // 5. Also close by tag (catches any notification we lost the ref to)
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        // Force-close via tag by creating a silent replacement and closing it
        const silent = new Notification("", { tag: "call_cleanup_usly", silent: true });
        silent.close();
      } catch {}
    }
  }

  private startRepeatingVibration() {
    this.stopRepeatingVibration();
    if (typeof navigator === "undefined" || !navigator.vibrate) return;

    const buzz = () => {
      try {
        navigator.vibrate([300, 200, 300, 200, 300]);
      } catch {}
    };

    buzz();
    this.vibrationInterval = setInterval(buzz, 3000);
  }

  private stopRepeatingVibration() {
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(0); // Stop any current vibration
      } catch {}
    }
  }

  private flashTitle(message: string) {
    if (typeof document === "undefined") return;
    this.resetTitle();

    let toggle = false;
    this.titleBlinkInterval = setInterval(() => {
      document.title = toggle ? message : this.originalTitle;
      toggle = !toggle;
    }, 900);
  }

  resetTitle() {
    if (this.titleBlinkInterval) {
      clearInterval(this.titleBlinkInterval);
      this.titleBlinkInterval = null;
    }
    if (typeof document !== "undefined") {
      document.title = this.originalTitle;
    }
  }
}

export const notificationService = new NotificationService();
