"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Heart,
  Video,
  Phone,
  Search,
  UserPlus,
  Users,
  MessageCircle,
  Sparkles,
  Check,
  X,
  RefreshCw,
  LogOut,
  Database,
  ArrowLeft,
  Clock,
  Palette,
} from "lucide-react";
import CallModal from "@/components/Call/CallModal";
import IncomingCallAlert from "@/components/Call/IncomingCallAlert";
import CallHistoryList from "@/components/Call/CallHistoryList";
import NotificationToast from "@/components/UI/NotificationToast";
import ProfileEditModal from "@/components/UI/ProfileEditModal";
import HeartEffect from "@/components/UI/HeartEffect";
import PingPickerModal from "@/components/UI/PingPickerModal";
import MessageList, { MessageItem } from "@/components/Chat/MessageList";
import MessageInput from "@/components/Chat/MessageInput";
import ThemePickerModal from "@/components/Chat/ThemePickerModal";
import { soundFX } from "@/lib/webrtc";
import { notificationService, ToastNotification } from "@/lib/notifications";
import { PingOption, getPingOptionFromContent } from "@/lib/lovePings";
import { ChatThemeId, CHAT_THEMES, DEFAULT_THEME_ID } from "@/lib/themes";

interface UserContact {
  username: string;
  name: string;
  avatar: string;
  status: "online" | "offline" | "busy";
  mood?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface IncomingRequest {
  id: string;
  senderUsername: string;
  senderName: string;
  senderAvatar: string;
  createdAt: string;
  status?: string;
}
const LOVE_KEYWORDS = [
  "love you",
  "love u",
  "i love you",
  "i love u",
  "ily",
  "miss you",
  "miss u",
  "kiss",
  "muah",
  "pyaar",
  "pyar",
];

const LOVE_EMOJIS_REGEX =
  /[\u2764\uFE0F?\u{1F496}\u{1F495}\u{1F498}\u{1F493}\u{1F497}\u{1F49D}\u{1F49E}\u{1F49F}\u{1F48C}\u{1F48B}\u{1F970}\u{1F60D}\u{1F48F}\u{1F491}]/u;

function isLoveMessage(content: string = "", type?: string): boolean {
  if (type === "love_ping") return true;
  if (!content) return false;
  const lower = content.toLowerCase();
  if (LOVE_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return LOVE_EMOJIS_REGEX.test(content);
}

// Connection request timer helper (keeps request accessible and actionable)
function getRemainingTime48h(createdAt?: string): { expired: boolean; text: string; hoursLeft: number; percent: number } {
  if (!createdAt) return { expired: false, text: "48h left", hoursLeft: 48, percent: 100 };
  const created = new Date(createdAt).getTime();
  const totalMs = 48 * 60 * 60 * 1000;
  const elapsedMs = Date.now() - created;
  const remainingMs = totalMs - elapsedMs;

  if (remainingMs <= 0) {
    // Graceful: Keep visible and actionable so the user can still connect
    return { expired: false, text: "Recent", hoursLeft: 0, percent: 12 };
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const percent = Math.max(8, Math.min(100, Math.round((remainingMs / totalMs) * 100)));

  if (hours > 0) {
    return { expired: false, text: `${hours}h ${minutes}m left`, hoursLeft: hours, percent };
  }
  return { expired: false, text: `${minutes}m left`, hoursLeft: 0, percent };
}

function formatChatListTime(timeStr?: string): string {
  if (!timeStr) return "";
  try {
    const d = new Date(timeStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function areMessagesEqual(a: MessageItem[], b: MessageItem[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const msgA = a[i];
    const msgB = b[i];
    if (!msgA || !msgB) return false;
    if (msgA.id !== msgB.id) return false;
    if (msgA.content !== msgB.content) return false;
    if (msgA.type !== msgB.type) return false;
    if ((msgA.reactions?.length || 0) !== (msgB.reactions?.length || 0)) return false;
  }
  return true;
}

function reconcileMessages(
  prevMessages: MessageItem[],
  dbMessages: MessageItem[],
  currentUsername: string
): MessageItem[] {
  if (!dbMessages || dbMessages.length === 0) {
    return (prevMessages || []).filter(
      (m) =>
        m &&
        m.id &&
        m.id.startsWith("opt_") &&
        m.senderUsername?.toLowerCase() === currentUsername.toLowerCase()
    );
  }
  if (!prevMessages || prevMessages.length === 0) {
    return dbMessages;
  }

  const map = new Map<string, MessageItem>();

  // 1. Authoritative DB messages
  for (const m of dbMessages) {
    if (m && m.id) {
      map.set(m.id, m);
    }
  }

  // 2. Preserve uncommitted optimistic or recent in-flight messages from prev
  const sixtySecondsAgo = Date.now() - 60_000;

  for (const prevMsg of prevMessages) {
    if (!prevMsg || !prevMsg.id) continue;

    if (prevMsg.id.startsWith("opt_")) {
      // Check if DB already has a matching real message
      const alreadyHasReal = dbMessages.some(
        (dbM) =>
          dbM.content === prevMsg.content &&
          dbM.senderUsername?.toLowerCase() === prevMsg.senderUsername?.toLowerCase()
      );
      if (!alreadyHasReal) {
        map.set(prevMsg.id, prevMsg);
      }
    } else if (!map.has(prevMsg.id)) {
      // Message exists in prev (from local send or recent SSE) but DB GET didn't return it yet (replica lag)
      const msgTime = prevMsg.createdAt ? new Date(prevMsg.createdAt).getTime() : 0;
      if (msgTime >= sixtySecondsAgo) {
        map.set(prevMsg.id, prevMsg);
      }
    } else {
      // Both have it: retain newer local reactions if any
      const dbMsg = map.get(prevMsg.id)!;
      if (prevMsg.reactions && (!dbMsg.reactions || prevMsg.reactions.length > dbMsg.reactions.length)) {
        map.set(prevMsg.id, { ...dbMsg, reactions: prevMsg.reactions });
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Current user state
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    name: string;
    avatar: string;
    mood: string;
  } | null>(null);

  // Profile Edit Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPingModalOpen, setIsPingModalOpen] = useState(false);
  const [pingEmojis, setPingEmojis] = useState<string[] | undefined>(undefined);

  // Active selected chat partner
  const [selectedUser, setSelectedUser] = useState<UserContact | null>(null);

  // Instagram Chat Theme State (3 themes: Sunset, Cyber, Rose)
  const [currentThemeId, setCurrentThemeId] = useState<ChatThemeId>(DEFAULT_THEME_ID);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("usly_chat_theme") as ChatThemeId;
    if (savedTheme && CHAT_THEMES[savedTheme]) {
      setCurrentThemeId(savedTheme);
    }
  }, []);

  // In-App Toast Notification
  const [activeToast, setActiveToast] = useState<ToastNotification | null>(null);

  // Sidebar navigation & lists
  const [activeTab, setActiveTab] = useState<"messages" | "calls" | "requests" | "search">("messages");
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);

  // 48-Hour live countdown timer ticker
  const [, setTimerTick] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Stable comparator for incoming requests to prevent 1-second interval re-renders / blinking
  const updateIncomingRequestsIfChanged = useCallback((newList: IncomingRequest[]) => {
    if (!Array.isArray(newList)) return;
    setIncomingRequests((prev) => {
      // Sort deterministically by senderUsername
      const sortedNew = [...newList].sort((a, b) =>
        (a.senderUsername || "").localeCompare(b.senderUsername || "")
      );
      const sortedPrev = [...prev].sort((a, b) =>
        (a.senderUsername || "").localeCompare(b.senderUsername || "")
      );

      if (
        sortedPrev.length === sortedNew.length &&
        sortedPrev.every(
          (p, idx) =>
            p.senderUsername?.toLowerCase() === sortedNew[idx]?.senderUsername?.toLowerCase() &&
            p.status === sortedNew[idx]?.status
        )
      ) {
        return prev; // EXACT SAME LIST - NO STATE UPDATE, ZERO BLINKING!
      }
      if (currentUserRef.current) {
        localStorage.setItem(
          `usly_incoming_requests_${currentUserRef.current.username.toLowerCase()}`,
          JSON.stringify(sortedNew)
        );
      }
      return sortedNew;
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserContact[]>([]);
  const [sentRequestUsernames, setSentRequestUsernames] = useState<string[]>([]);

  // Messages in active thread
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [triggerHeart, setTriggerHeart] = useState<number>(0);
  const [isShaking, setIsShaking] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ isConnected: boolean; error?: string }>({ isConnected: false });

  // WebRTC Calling
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    isCaller: boolean;
    type: "audio" | "video";
    partnerName?: string;
    partnerUsername?: string;
    partnerAvatar?: string;
  } | null>(null);

  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    callerName: string;
    callerUsername: string;
    callerAvatar?: string;
    type: "audio" | "video";
  } | null>(null);

  // Synchronization refs for stable SSE and async event handlers without connection churn
  const selectedUserRef = useRef(selectedUser);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const contactsRef = useRef(contacts);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // Track active ringing callId to strictly prevent duplicate notifications / double rings
  const ringingCallIdRef = useRef<string | null>(null);
  // Track if user explicitly closed the chat so auto-select doesn't re-open it on mobile
  const userDismissedChatRef = useRef<boolean>(false);

  // Single unified incoming call handler — guarantees notification fires ONLY ONCE
  const handleIncomingCallDetected = (call: {
    callId: string;
    callerName: string;
    callerUsername: string;
    callerAvatar?: string;
    type?: "audio" | "video";
  }) => {
    if (activeCallRef.current || ringingCallIdRef.current === call.callId) {
      return;
    }
    ringingCallIdRef.current = call.callId;

    setIncomingCall({
      callId: call.callId,
      callerName: call.callerName,
      callerUsername: call.callerUsername,
      callerAvatar: call.callerAvatar,
      type: call.type || "video",
    });

    notificationService.notifyIncomingCall(
      call.callerName,
      call.callerUsername,
      call.type || "video",
      call.callerAvatar,
      undefined,
      call.callId
    );
  };

  // Unified contact selection: synchronously sets selectedUser, switches tab,
  // clears unread count, and loads cached messages immediately with zero flash
  const handleSelectContact = (contact: UserContact) => {
    if (!contact) return;
    const partnerUname = contact.username.toLowerCase();
    const myUname = (currentUserRef.current?.username || "").toLowerCase();

    userDismissedChatRef.current = false;

    // 1. Immediately update selected contact & ensure messages tab synchronously
    selectedUserRef.current = contact;
    setSelectedUser(contact);
    setActiveTab("messages");

    // 2. Clear unread badge in contacts list
    setContacts((prev) =>
      prev.map((c) =>
        c.username.toLowerCase() === partnerUname
          ? { ...c, unreadCount: 0 }
          : c
      )
    );

    // 3. Synchronously switch active message feed to this partner's cached messages (or clean empty state)
    try {
      const cacheKey = `usly_msgs_${myUname}_${partnerUname}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setMessages(Array.isArray(parsed) ? parsed : []);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }

    // 4. Persist active partner so refresh restores open chat
    if (myUname) {
      localStorage.setItem(`usly_active_partner_${myUname}`, partnerUname);
      localStorage.setItem(`usly_last_active_partner_${myUname}`, partnerUname);
      localStorage.setItem(`usly_last_active_partner_obj_${myUname}`, JSON.stringify(contact));
    }
  };

  // 1. Initialize current user from Session or localStorage & Request Notifications
  useEffect(() => {
    if (authStatus === "loading") return;

    let storedUsername = localStorage.getItem("usly_username");
    let storedName = localStorage.getItem("usly_name");
    let storedAvatar = localStorage.getItem("usly_avatar");

    if (!storedUsername && session?.user) {
      const email = session.user.email || "";
      const baseName = session.user.name || email.split("@")[0] || "user";
      storedUsername = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || "user";
      storedName = baseName;
      storedAvatar = session.user.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${storedUsername}`;

      localStorage.setItem("usly_username", storedUsername);
      localStorage.setItem("usly_name", storedName);
      if (storedAvatar) localStorage.setItem("usly_avatar", storedAvatar);
    }

    if (!storedUsername) {
      router.push("/login");
      return;
    }

    const myUser = {
      username: storedUsername,
      name: storedName || storedUsername,
      avatar: storedAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${storedUsername}`,
      mood: "Ready to chat 💬",
    };
    setCurrentUser(myUser);

    // Request browser notification permissions
    notificationService.requestPermission().catch(() => {});

    // Instant load cached contacts from localStorage and restore active chat partner
    const cleanUsername = storedUsername.toLowerCase();
    try {
      const cachedContactsStr =
        localStorage.getItem(`usly_contacts_${cleanUsername}`) ||
        localStorage.getItem(`usly_contacts_${storedUsername}`);
      let parsedContacts: UserContact[] = [];
      if (cachedContactsStr) {
        const parsed = JSON.parse(cachedContactsStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsedContacts = parsed.filter(
            (c) => c.username.toLowerCase() !== cleanUsername
          );
          setContacts(parsedContacts);
        }
      }

      // Restore active chat partner on refresh so open chat is always showing exactly where user left off
      const lastPartnerObjStr = localStorage.getItem(`usly_last_active_partner_obj_${cleanUsername}`);
      const lastPartner =
        localStorage.getItem(`usly_active_partner_${cleanUsername}`) ||
        localStorage.getItem(`usly_last_active_partner_${cleanUsername}`) ||
        localStorage.getItem(`usly_active_partner_${storedUsername}`);

      if (lastPartnerObjStr) {
        try {
          const parsedPartner = JSON.parse(lastPartnerObjStr);
          if (parsedPartner && parsedPartner.username && parsedPartner.username.toLowerCase() !== cleanUsername) {
            handleSelectContact(parsedPartner);
          }
        } catch {}
      } else if (parsedContacts.length > 0) {
        const matched = lastPartner
          ? parsedContacts.find(
              (c) => c.username.toLowerCase() === lastPartner.toLowerCase()
            ) || parsedContacts[0]
          : parsedContacts[0];
        if (matched) {
          handleSelectContact(matched);
        }
      }
    } catch {}

    // Instant fetch live conversations from API and merge without dropping locally initiated chats
    fetch(`/api/conversations?username=${cleanUsername}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.conversations && Array.isArray(data.conversations)) {
          setContacts((prev) => {
            const apiMap = new Map<string, UserContact>();
            const filteredApi = data.conversations.filter(
              (c: UserContact) => c.username.toLowerCase() !== cleanUsername
            );
            for (const c of filteredApi) {
              apiMap.set(c.username.toLowerCase(), c);
            }
            const updatedFromApi: UserContact[] = filteredApi.map((c: UserContact) => {
              const existing = prev.find((p) => p.username.toLowerCase() === c.username.toLowerCase());
              return {
                ...c,
                unreadCount: existing?.unreadCount || 0,
              };
            });
            const preserved: UserContact[] = [];
            for (const p of prev) {
              if (
                !apiMap.has(p.username.toLowerCase()) &&
                p.username.toLowerCase() !== cleanUsername
              ) {
                preserved.push(p);
              }
            }
            const merged = [...updatedFromApi, ...preserved];
            localStorage.setItem(
              `usly_contacts_${cleanUsername}`,
              JSON.stringify(merged)
            );

            // Keep active chat open on desktop if not dismissed
            const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
            if (!selectedUserRef.current && !userDismissedChatRef.current && isDesktop && merged.length > 0) {
              const lastPartner =
                localStorage.getItem(`usly_active_partner_${cleanUsername}`) ||
                localStorage.getItem(`usly_last_active_partner_${cleanUsername}`);
              const matched = lastPartner
                ? merged.find((c) => c.username.toLowerCase() === lastPartner.toLowerCase()) || merged[0]
                : merged[0];
              if (matched) {
                handleSelectContact(matched);
              }
            }

            return merged;
          });
        }
      })
      .catch(() => {});

    // Load cached incoming requests immediately to prevent flash/delay
    try {
      const cachedReqs = localStorage.getItem(`usly_incoming_requests_${cleanUsername}`);
      if (cachedReqs) {
        const parsed = JSON.parse(cachedReqs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setIncomingRequests(parsed);
        }
      }
    } catch {}

    // Load cached sent requests from local device storage immediately
    try {
      const cachedSent = localStorage.getItem(`usly_sent_requests_${cleanUsername}`);
      if (cachedSent) {
        const parsed = JSON.parse(cachedSent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSentRequestUsernames(parsed);
        }
      }
    } catch {}

    // Load cached directory users from local device storage immediately
    try {
      const cachedUsersStr = localStorage.getItem(`usly_directory_users_${cleanUsername}`);
      if (cachedUsersStr) {
        const parsed = JSON.parse(cachedUsersStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((u: any) => u.username && u.username.toLowerCase() !== cleanUsername);
          setSearchResults(valid);
        }
      }
    } catch {}

    // Instant fetch all active/registered users for discovery and merge into local device storage
    fetch(`/api/users/search?currentUsername=${cleanUsername}&currentName=${encodeURIComponent(storedName || cleanUsername)}&currentAvatar=${encodeURIComponent(storedAvatar || "")}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.users && Array.isArray(data.users)) {
          setSearchResults((prev) => {
            const map = new Map<string, UserContact>();
            // 1. Keep all previously cached users from device
            for (const u of prev) {
              if (u.username && u.username.toLowerCase() !== cleanUsername) {
                map.set(u.username.toLowerCase(), u);
              }
            }
            // 2. Merge fresh data from server
            for (const u of data.users) {
              if (u.username && u.username.toLowerCase() !== cleanUsername) {
                const existing = map.get(u.username.toLowerCase());
                map.set(u.username.toLowerCase(), {
                  ...existing,
                  ...u,
                });
              }
            }
            const merged = Array.from(map.values()).sort((a, b) => {
              if (a.status === "online" && b.status !== "online") return -1;
              if (b.status === "online" && a.status !== "online") return 1;
              return (a.name || "").localeCompare(b.name || "");
            });

            // Store persistently in local device!
            localStorage.setItem(
              `usly_directory_users_${cleanUsername}`,
              JSON.stringify(merged)
            );

            // On desktop, open first user if none selected
            const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
            if (!selectedUserRef.current && !userDismissedChatRef.current && isDesktop && merged.length > 0) {
              const lastPartner = localStorage.getItem(`usly_active_partner_${cleanUsername}`);
              const matched = lastPartner
                ? merged.find((u: any) => u.username.toLowerCase() === lastPartner.toLowerCase()) || merged[0]
                : merged[0];
              if (matched) {
                handleSelectContact(matched);
              }
            }

            return merged;
          });
        }
      })
      .catch(() => {});

    // Register & sync user profile with MongoDB across all devices
    fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(myUser),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.dbConnected !== undefined) {
          setDbStatus({ isConnected: data.dbConnected, error: data.dbError });
        }
        if (data.user) {
          setCurrentUser((prev) => {
            const updated = {
              username: data.user.username || prev?.username || cleanUsername,
              name: data.user.name || prev?.name || cleanUsername,
              avatar: data.user.avatar || prev?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
              mood: data.user.mood || prev?.mood || "Ready to chat 💬",
            };
            localStorage.setItem("usly_username", updated.username);
            localStorage.setItem("usly_name", updated.name);
            localStorage.setItem("usly_avatar", updated.avatar);
            localStorage.setItem("usly_mood", updated.mood);
            return updated;
          });
        }
      })
      .catch(() => {});
  }, [session, authStatus, router]);

  // 2. Load messages from DB whenever selectedUser changes (DB is source of truth)
  useEffect(() => {
    if (!currentUser || !selectedUser) return;
    let isCancelled = false;
    const myUname = currentUser.username.toLowerCase();
    const partnerUname = selectedUser.username.toLowerCase();

    localStorage.setItem(`usly_active_partner_${myUname}`, partnerUname);
    const cacheKey = `usly_msgs_${myUname}_${partnerUname}`;

    // Show cache immediately for perceived speed (but DB will replace it)
    try {
      const cachedMsgsStr = localStorage.getItem(cacheKey);
      if (cachedMsgsStr) {
        const cachedMsgs = JSON.parse(cachedMsgsStr);
        if (Array.isArray(cachedMsgs) && cachedMsgs.length > 0) {
          setMessages(cachedMsgs);
        } else {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }

    // Always fetch from DB — authoritative source for ALL devices
    fetch(`/api/messages?myUsername=${myUname}&partnerUsername=${partnerUname}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isCancelled && data.messages && Array.isArray(data.messages)) {
          if (selectedUserRef.current?.username.toLowerCase() === partnerUname) {
            // DB response is authoritative — reconcile with cache/state
            const dbMessages: MessageItem[] = data.messages;
            setMessages((prev) => {
              const reconciled = reconcileMessages(prev, dbMessages, myUname);
              if (areMessagesEqual(prev, reconciled)) return prev;
              localStorage.setItem(cacheKey, JSON.stringify(reconciled));
              return reconciled;
            });
          }
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [selectedUser?.username, currentUser?.username]);

  // 2b. Intercept mobile hardware back button — go to chat list, NOT login page
  useEffect(() => {
    if (selectedUser && window.history.state?.chatOpen !== true) {
      // Push a "fake" state so the back button has something to pop
      window.history.pushState({ chatOpen: true }, "", window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      if (selectedUserRef.current) {
        // Back button pressed while chat is open → close chat, stay on page
        e.preventDefault();
        userDismissedChatRef.current = true;
        selectedUserRef.current = null;
        setSelectedUser(null);
        if (currentUserRef.current) {
          localStorage.removeItem(`usly_active_partner_${currentUserRef.current.username.toLowerCase()}`);
          localStorage.removeItem(`usly_last_active_partner_${currentUserRef.current.username.toLowerCase()}`);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [selectedUser]);

  // Safety net: stop ALL call alerts & notifications whenever incomingCall or activeCall clears (any path)
  useEffect(() => {
    if (!incomingCall && !activeCall) {
      ringingCallIdRef.current = null;
      notificationService.stopRingtone();
      setActiveToast((prev) => (prev?.type === "call" ? null : prev));
    } else if (incomingCall) {
      ringingCallIdRef.current = incomingCall.callId;
    }
  }, [incomingCall, activeCall]);

  // 3. Real-time EventSource Stream + Polling Fallback with Auto-Reconnect
  useEffect(() => {
    if (!currentUser) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectDelay = 1000; // Start at 1s, exponential backoff
    let isMounted = true;

    const refreshConversations = async () => {
      try {
        const convRes = await fetch(`/api/conversations?username=${currentUser.username}`);
        if (convRes.ok) {
          const convData = await convRes.json();
          if (convData.conversations && Array.isArray(convData.conversations)) {
            setContacts((prev) => {
              const apiMap = new Map<string, UserContact>();
              for (const c of convData.conversations) {
                apiMap.set(c.username.toLowerCase(), c);
              }

              // Update existing contacts with API data and preserve unreadCount
              const updatedFromApi: UserContact[] = convData.conversations.map((c: UserContact) => {
                const existing = prev.find((p) => p.username.toLowerCase() === c.username.toLowerCase());
                return {
                  ...c,
                  unreadCount: existing?.unreadCount || 0,
                };
              });

              // CRITICAL: Keep newly initiated chats or local contacts that haven't exchanged messages yet!
              const preservedLocalContacts: UserContact[] = [];
              for (const p of prev) {
                if (!apiMap.has(p.username.toLowerCase())) {
                  preservedLocalContacts.push(p);
                }
              }

              const merged = [...updatedFromApi, ...preservedLocalContacts];
              localStorage.setItem(
                `usly_contacts_${currentUser.username}`,
                JSON.stringify(merged)
              );
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn("Conversations refresh error:", err);
      }
    };

    const setupSSE = () => {
      if (!isMounted) return;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      try {
        eventSource = new EventSource(`/api/calls/stream?username=${currentUser.username}`);

        eventSource.onopen = () => {
          reconnectDelay = 1000; // Reset delay on successful connect
        };

        eventSource.onerror = () => {
          if (!isMounted) return;
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Auto-reconnect with exponential backoff (max 15s)
          reconnectTimeout = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
            setupSSE();
          }, reconnectDelay);
        };

        // Instant Incoming Call Detection (< 20ms)
        eventSource.addEventListener("call", (e) => {
          try {
            const data = JSON.parse(e.data);
            const call = data.call;
            if (
              call &&
              call.receiverUsername.toLowerCase() === currentUser.username.toLowerCase() &&
              call.status === "ringing"
            ) {
              handleIncomingCallDetected(call);
            } else if (
              !call ||
              call.status === "ended" ||
              call.status === "declined" ||
              call.status === "missed"
            ) {
              ringingCallIdRef.current = null;
              setIncomingCall(null);
              setActiveToast((prev) => (prev?.type === "call" ? null : prev));
              notificationService.stopRingtone();
            }
          } catch {}
        });

        eventSource.addEventListener("call_ended", () => {
          try {
            ringingCallIdRef.current = null;
            setIncomingCall(null);
            setActiveCall(null);
            setActiveToast((prev) => (prev?.type === "call" ? null : prev));
            notificationService.stopRingtone();
          } catch {}
        });

        // Instant Message Reception
        eventSource.addEventListener("message", (e) => {
          try {
            const msg = JSON.parse(e.data);
            const senderUname = (msg.senderUsername || "").toLowerCase();
            const receiverUname = (msg.receiverUsername || "").toLowerCase();

            // Refresh contact list preview
            refreshConversations();

            const curSelected = selectedUserRef.current;
            const curActiveCall = activeCallRef.current;

            if (senderUname !== currentUser.username.toLowerCase()) {
              const isInCallWithSender =
                curActiveCall && curActiveCall.partnerUsername?.toLowerCase() === senderUname;
              const isCurrentChatOpen =
                (curSelected && curSelected.username.toLowerCase() === senderUname) ||
                isInCallWithSender;

              let preview = msg.content || "";
              if (msg.type === "love_ping") {
                const ping = getPingOptionFromContent(msg.content);
                preview = `${ping.icon} Sent a ${ping.title} Ping!`;
              } else if (msg.type === "image") preview = "📷 Photo";
              else if (msg.type === "voice") preview = `🎤 Voice note (${msg.audioDuration || 3}s)`;
              else if (msg.type === "sticker") preview = "✨ Sticker";

              const senderAvatar =
                msg.senderAvatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderUname}`;
              const senderName = msg.senderName || senderUname;

              // Immediately update contact list preview and sort to top
              setContacts((prev) => {
                const existingIdx = prev.findIndex(
                  (c) => c.username.toLowerCase() === senderUname
                );
                let updatedContact: UserContact;
                if (existingIdx >= 0) {
                  const existing = prev[existingIdx];
                  updatedContact = {
                    ...existing,
                    lastMessage: preview,
                    lastMessageTime: msg.createdAt || new Date().toISOString(),
                    unreadCount: isCurrentChatOpen ? 0 : (existing.unreadCount || 0) + 1,
                  };
                } else {
                  updatedContact = {
                    username: senderUname,
                    name: senderName,
                    avatar: senderAvatar,
                    status: "online",
                    lastMessage: preview,
                    lastMessageTime: msg.createdAt || new Date().toISOString(),
                    unreadCount: isCurrentChatOpen ? 0 : 1,
                  };
                }
                const filtered = prev.filter(
                  (c) => c.username.toLowerCase() !== senderUname
                );
                const nextContacts = [updatedContact, ...filtered];
                localStorage.setItem(
                  `usly_contacts_${currentUser.username.toLowerCase()}`,
                  JSON.stringify(nextContacts)
                );
                return nextContacts;
              });

              if (isCurrentChatOpen) {
                if (!isInCallWithSender) {
                  soundFX.playChatSound();
                  if (isLoveMessage(msg.content, msg.type)) {
                    const ping = getPingOptionFromContent(msg.content);
                    setPingEmojis(ping.emojis);
                    setTriggerHeart(Date.now());
                  }
                  if (msg.type === "love_ping") {
                    soundFX.playLovePing();
                    setIsShaking(true);
                    setTimeout(() => setIsShaking(false), 800);
                  }
                }
              } else {
                // Trigger system notification, chime, and top toast
                notificationService.notifyMessage(
                  senderName,
                  senderUname,
                  senderAvatar,
                  msg.content,
                  msg.type,
                  () => {
                    const targetUser =
                      contactsRef.current.find(
                        (c) => c.username.toLowerCase() === senderUname
                      ) || {
                        username: senderUname,
                        name: senderName,
                        avatar: senderAvatar,
                        status: "online" as const,
                      };
                    handleSelectContact(targetUser);
                  }
                );

                setActiveToast({
                  id: msg.id || String(Date.now()),
                  senderName: senderName,
                  senderUsername: senderUname,
                  senderAvatar: senderAvatar,
                  content: msg.content,
                  type: msg.type || "text",
                  timestamp: Date.now(),
                });
              }
            }

            const isForActiveChat =
              curSelected &&
              ((senderUname === curSelected.username.toLowerCase() &&
                receiverUname === currentUser.username.toLowerCase()) ||
                (senderUname === currentUser.username.toLowerCase() &&
                  receiverUname === curSelected.username.toLowerCase()));

            if (isForActiveChat) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                // Reconcile optimistic message if this is our sent message
                const optMatch = prev.findIndex(
                  (m) =>
                    m.id.startsWith("opt_") &&
                    m.senderUsername.toLowerCase() === senderUname &&
                    m.content === msg.content
                );
                let next: MessageItem[];
                if (optMatch > -1) {
                  next = [...prev];
                  next[optMatch] = msg;
                } else {
                  next = [...prev, msg];
                }
                localStorage.setItem(
                  `usly_msgs_${currentUser.username.toLowerCase()}_${curSelected.username.toLowerCase()}`,
                  JSON.stringify(next)
                );
                return next;
              });
            }
          } catch {}
        });

        // Instant Request Reception
        eventSource.addEventListener("request", () => {
          fetch(`/api/requests?username=${currentUser.username.toLowerCase()}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.incomingPending) updateIncomingRequestsIfChanged(data.incomingPending);
            })
            .catch(() => {});
          refreshConversations();
        });

      } catch (err) {
        console.warn("EventSource setup warning:", err);
      }
    };

    setupSSE();

    const poll = async () => {
      try {
        // 1. Fetch Conversations & Requests
        refreshConversations();

        const reqRes = await fetch(`/api/requests?username=${currentUser.username.toLowerCase()}`);
        if (reqRes.ok) {
          const reqData = await reqRes.json();
          if (Array.isArray(reqData.incomingPending)) {
            updateIncomingRequestsIfChanged(reqData.incomingPending);
          }
          if (Array.isArray(reqData.outgoingPending)) {
            const apiSent = reqData.outgoingPending.map((r: any) => (r.receiverUsername || "").toLowerCase());
            setSentRequestUsernames((prev) => {
              const merged = Array.from(new Set([...prev, ...apiSent]));
              if (currentUserRef.current) {
                localStorage.setItem(
                  `usly_sent_requests_${currentUserRef.current.username.toLowerCase()}`,
                  JSON.stringify(merged)
                );
              }
              return merged;
            });
          }
        }

        // 2. Fetch Messages for active selected chat (DB is source of truth)
        const currentSelected = selectedUserRef.current;
        if (currentSelected) {
          const myUname = currentUser.username.toLowerCase();
          const partnerUname = currentSelected.username.toLowerCase();
          const msgRes = await fetch(
            `/api/messages?myUsername=${myUname}&partnerUsername=${partnerUname}`
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            if (
              msgData.messages &&
              Array.isArray(msgData.messages) &&
              selectedUserRef.current?.username.toLowerCase() === partnerUname
            ) {
              const dbMessages: MessageItem[] = msgData.messages;
              setMessages((prev) => {
                // Ensure active selected partner hasn't changed during network flight
                if (selectedUserRef.current?.username.toLowerCase() !== partnerUname) {
                  return prev;
                }

                // Play sound if new messages arrived from partner
                const newPartnerMsgs = dbMessages.filter(
                  (m) =>
                    m.senderUsername?.toLowerCase() === partnerUname &&
                    !prev.some((p) => p.id === m.id)
                );
                if (newPartnerMsgs.length > 0 && prev.length > 0) {
                  const latestMsg = newPartnerMsgs[newPartnerMsgs.length - 1];
                  soundFX.playChatSound();
                  if (isLoveMessage(latestMsg.content, latestMsg.type)) {
                    setTriggerHeart(Date.now());
                  }
                }

                // Reconcile and preserve in-flight optimistic or recent messages
                const finalMessages = reconcileMessages(prev, dbMessages, myUname);

                // If identical, return prev to prevent re-render, scroll jump, and blinking!
                if (areMessagesEqual(prev, finalMessages)) {
                  return prev;
                }

                localStorage.setItem(
                  `usly_msgs_${myUname}_${partnerUname}`,
                  JSON.stringify(finalMessages)
                );
                return finalMessages;
              });
            }
          }
        }

        // 3. Fallback check for Incoming Calls (in case SSE missed it)
        if (!activeCallRef.current) {
          const callRes = await fetch(`/api/calls/signal?username=${currentUser.username}`);
          if (callRes.ok) {
            const callData = await callRes.json();
            if (
              callData.activeCall &&
              callData.activeCall.receiverUsername.toLowerCase() === currentUser.username.toLowerCase() &&
              callData.activeCall.status === "ringing"
            ) {
              handleIncomingCallDetected(callData.activeCall);
            } else if (!callData.activeCall || callData.activeCall.status !== "ringing") {
              // Caller hung up / call ended — stop ringtone immediately and dismiss alert & toast
              if (ringingCallIdRef.current || incomingCall) {
                ringingCallIdRef.current = null;
                setIncomingCall(null);
                setActiveToast((prev) => (prev?.type === "call" ? null : prev));
                notificationService.stopRingtone();
              }
            }
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(interval);
    };
  }, [currentUser?.username]);

  // Search users directory (refreshes automatically with presence keepalive and device storage caching)
  const fetchSearch = useCallback(async () => {
    if (!currentUserRef.current) return;
    const cleanUsername = currentUserRef.current.username.toLowerCase();
    const cleanName = currentUserRef.current.name || cleanUsername;
    const cleanAvatar = currentUserRef.current.avatar || "";

    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}&currentUsername=${encodeURIComponent(cleanUsername)}&currentName=${encodeURIComponent(cleanName)}&currentAvatar=${encodeURIComponent(cleanAvatar)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setSearchResults((prev) => {
            // If user typed a search query, show the exact search results
            if (searchQuery.trim()) {
              return data.users.filter((u: any) => u.username && u.username.toLowerCase() !== cleanUsername);
            }

            // If exploring (empty search query), MERGE with local cache so users never vanish!
            const map = new Map<string, UserContact>();
            for (const u of prev) {
              if (u.username && u.username.toLowerCase() !== cleanUsername) {
                map.set(u.username.toLowerCase(), u);
              }
            }
            for (const u of data.users) {
              if (u.username && u.username.toLowerCase() !== cleanUsername) {
                const existing = map.get(u.username.toLowerCase());
                map.set(u.username.toLowerCase(), {
                  ...existing,
                  ...u,
                });
              }
            }
            const merged = Array.from(map.values()).sort((a, b) => {
              if (a.status === "online" && b.status !== "online") return -1;
              if (b.status === "online" && a.status !== "online") return 1;
              return (a.name || "").localeCompare(b.name || "");
            });

            // Store persistently in local device!
            localStorage.setItem(
              `usly_directory_users_${cleanUsername}`,
              JSON.stringify(merged)
            );
            return merged;
          });
        }
      }
    } catch (e) {
      console.warn("Search fetch error:", e);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchSearch();
    // Auto-poll search/directory every 4 seconds when in search or messages tab
    const interval = setInterval(fetchSearch, 4000);
    return () => clearInterval(interval);
  }, [fetchSearch, activeTab]);

  // Send connection request (chat starts only after acceptance)
  const handleSendRequest = async (targetUser: UserContact) => {
    if (!currentUserRef.current) return;
    const myUname = currentUserRef.current.username.toLowerCase();
    const targetUname = targetUser.username.toLowerCase();

    // 1. Immediately store in sentRequestUsernames & localStorage on local device
    setSentRequestUsernames((prev) => {
      const next = Array.from(new Set([...prev.filter((u) => u !== targetUname), targetUname]));
      localStorage.setItem(`usly_sent_requests_${myUname}`, JSON.stringify(next));
      return next;
    });

    // 2. Ensure targetUser is saved in local device storage
    try {
      const cachedUsersStr = localStorage.getItem(`usly_directory_users_${myUname}`);
      const cachedUsers: UserContact[] = cachedUsersStr ? JSON.parse(cachedUsersStr) : [];
      if (!cachedUsers.some((u) => u.username.toLowerCase() === targetUname)) {
        cachedUsers.push(targetUser);
        localStorage.setItem(`usly_directory_users_${myUname}`, JSON.stringify(cachedUsers));
      }
    } catch {}

    soundFX.playLovePing();
    setActiveToast({
      id: String(Date.now()),
      senderName: targetUser.name,
      senderUsername: targetUser.username,
      senderAvatar: targetUser.avatar,
      content: `Request sent to @${targetUser.username}! Chat will start once accepted. 💖`,
      type: "text",
      timestamp: Date.now(),
    });

    try {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          senderUsername: currentUserRef.current.username,
          senderName: currentUserRef.current.name,
          senderAvatar: currentUserRef.current.avatar,
          receiverUsername: targetUser.username,
        }),
      });
    } catch (e) {
      console.error("Send request error:", e);
    }
  };

  // Accept incoming connection request
  const handleAcceptRequest = async (req: IncomingRequest) => {
    try {
      setIncomingRequests((prev) => {
        const next = prev.filter(
          (r) => r.id !== req.id && r.senderUsername.toLowerCase() !== req.senderUsername.toLowerCase()
        );
        if (currentUser) {
          localStorage.setItem(
            `usly_incoming_requests_${currentUser.username.toLowerCase()}`,
            JSON.stringify(next)
          );
        }
        return next;
      });

      const newContact: UserContact = {
        username: req.senderUsername,
        name: req.senderName,
        avatar: req.senderAvatar,
        status: "online",
        mood: "Just connected! 🎉",
        lastMessage: "Connected! Click to chat ✨",
      };
      setContacts((prev) => [
        newContact,
        ...prev.filter((c) => c.username.toLowerCase() !== req.senderUsername.toLowerCase()),
      ]);
      handleSelectContact(newContact);
      soundFX.playLovePing();
      setTriggerHeart(Date.now());

      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          requestId: req.id,
          senderUsername: req.senderUsername,
          receiverUsername: currentUser?.username,
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Decline incoming connection request
  const handleDeclineRequest = async (req: IncomingRequest) => {
    try {
      setIncomingRequests((prev) => {
        const next = prev.filter(
          (r) => r.id !== req.id && r.senderUsername.toLowerCase() !== req.senderUsername.toLowerCase()
        );
        if (currentUser) {
          localStorage.setItem(
            `usly_incoming_requests_${currentUser.username.toLowerCase()}`,
            JSON.stringify(next)
          );
        }
        return next;
      });

      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline",
          requestId: req.id,
          senderUsername: req.senderUsername,
          receiverUsername: currentUser?.username,
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Send message in active chat
  const handleSendMessage = async (
    content: string,
    type: "text" | "voice" | "image" | "sticker" | "love_ping" = "text",
    audioDuration?: number
  ) => {
    if (!currentUser || !selectedUser) return;
    const myUname = currentUser.username.toLowerCase();
    const partnerUname = selectedUser.username.toLowerCase();
    const cacheKey = `usly_msgs_${myUname}_${partnerUname}`;

    const optimistic: MessageItem = {
      id: "opt_" + Date.now(),
      senderUsername: currentUser.username,
      senderName: currentUser.name,
      type,
      content,
      audioDuration,
      reactions: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, optimistic];
      localStorage.setItem(cacheKey, JSON.stringify(next));
      return next;
    });

    if (isLoveMessage(content, type)) {
      setTriggerHeart(Date.now());
    }

    // Update conversation list preview & bring to top
    let preview = content;
    if (type === "love_ping") {
      const ping = getPingOptionFromContent(content);
      preview = `${ping.icon} Sent a ${ping.title} Ping!`;
    }
    else if (type === "image") preview = "📷 Photo";
    else if (type === "voice") preview = `🎤 Voice note (${audioDuration || 3}s)`;
    else if (type === "sticker") preview = "✨ Sticker";

    const displayPreview = `You: ${preview}`;

    setContacts((prev) => {
      const existing = prev.find(
        (c) => c.username.toLowerCase() === partnerUname
      );
      const updatedContact: UserContact = {
        ...(existing || selectedUser),
        lastMessage: displayPreview,
        lastMessageTime: new Date().toISOString(),
      };
      const filtered = prev.filter(
        (c) => c.username.toLowerCase() !== partnerUname &&
               c.username.toLowerCase() !== myUname
      );
      const nextContacts = [updatedContact, ...filtered];
      localStorage.setItem(
        `usly_contacts_${myUname}`,
        JSON.stringify(nextContacts)
      );
      return nextContacts;
    });

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUsername: currentUser.username,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar,
          receiverUsername: selectedUser.username,
          type,
          content,
          audioDuration,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message && data.message.id) {
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === optimistic.id ? { ...m, id: data.message.id } : m
            );
            localStorage.setItem(cacheKey, JSON.stringify(next));
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Message send error:", err);
    }
  };

  // Love Ping trigger (Supports multiple distinct romantic pings: Love You, Miss You, Kiss, Hug, Thinking of You, Nudge)
  const handleSendLovePing = (customPing?: PingOption) => {
    if (!customPing) {
      setIsPingModalOpen(true);
      return;
    }
    soundFX.playLovePing();
    setPingEmojis(customPing.emojis);
    setTriggerHeart(Date.now());
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 800);
    handleSendMessage(customPing.messageContent, "love_ping");
  };

  // Add Emoji Reaction
  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!currentUser || !selectedUser) return;
    const myUname = currentUser.username.toLowerCase();
    const partnerUname = selectedUser.username.toLowerCase();
    const cacheKey = `usly_msgs_${myUname}_${partnerUname}`;

    setMessages((prev) => {
      const updated = prev.map((msg) => {
        if (msg.id === messageId) {
          const reactions = msg.reactions || [];
          const existing = reactions.find((r) => r.user === currentUser.username);
          let newReactions;
          if (existing) {
            newReactions = reactions.filter((r) => r.user !== currentUser.username);
            if (existing.emoji !== emoji) {
              newReactions.push({ user: currentUser.username, emoji });
            }
          } else {
            newReactions = [...reactions, { user: currentUser.username, emoji }];
          }
          return { ...msg, reactions: newReactions };
        }
        return msg;
      });
      localStorage.setItem(cacheKey, JSON.stringify(updated));
      return updated;
    });

    try {
      await fetch("/api/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, user: currentUser.username, emoji }),
      });
    } catch (e) {}
  };

  // WebRTC Video Call — ring receiver IMMEDIATELY, negotiate SDP after
  const handleStartVideoCall = async (overridePartner?: UserContact) => {
    const partner = overridePartner || selectedUser;
    if (!currentUser || !partner) return;
    const callId = "call_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 🔔 Step 1: Send ringing signal INSTANTLY with keepalive
    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initiate",
        callId,
        callerUsername: currentUser.username,
        callerName: currentUser.name,
        callerAvatar: currentUser.avatar,
        receiverUsername: partner.username,
        type: "video",
      }),
      keepalive: true,
    }).catch((e) => console.error("Failed to initiate call signal:", e));

    // Step 2: Mount the CallModal immediately
    setActiveCall({
      callId,
      isCaller: true,
      type: "video",
      partnerName: partner.name,
      partnerUsername: partner.username,
      partnerAvatar: partner.avatar,
    });
  };

  // WebRTC Audio Call — same instant-ring approach
  const handleStartAudioCall = async (overridePartner?: UserContact) => {
    const partner = overridePartner || selectedUser;
    if (!currentUser || !partner) return;
    const callId = "call_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initiate",
        callId,
        callerUsername: currentUser.username,
        callerName: currentUser.name,
        callerAvatar: currentUser.avatar,
        receiverUsername: partner.username,
        type: "audio",
      }),
      keepalive: true,
    }).catch((e) => console.error("Failed to initiate audio call signal:", e));

    setActiveCall({
      callId,
      isCaller: true,
      type: "audio",
      partnerName: partner.name,
      partnerUsername: partner.username,
      partnerAvatar: partner.avatar,
    });
  };

  // Answer incoming call
  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const currentIncoming = incomingCall;
    ringingCallIdRef.current = null;
    notificationService.stopRingtone();
    setActiveToast(null);

    // Notify backend immediately that receiver accepted
    fetch("/api/calls/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", callId: currentIncoming.callId }),
      keepalive: true,
    }).catch(() => {});

    const matchedContact = contacts.find(
      (c) => c.username.toLowerCase() === currentIncoming.callerUsername.toLowerCase()
    );
    const partnerName =
      currentIncoming.callerName || matchedContact?.name || currentIncoming.callerUsername;
    const partnerAvatar =
      currentIncoming.callerAvatar ||
      matchedContact?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentIncoming.callerUsername}`;

    const callerContact: UserContact = {
      username: currentIncoming.callerUsername,
      name: partnerName,
      avatar: partnerAvatar,
      status: "online" as const,
    };

    handleSelectContact(callerContact);
    setActiveCall({
      callId: currentIncoming.callId,
      isCaller: false,
      type: currentIncoming.type,
      partnerName,
      partnerUsername: currentIncoming.callerUsername,
      partnerAvatar,
    });
    setIncomingCall(null);
  };

  // Decline incoming call
  const handleDeclineCall = async () => {
    if (!incomingCall) return;
    ringingCallIdRef.current = null;
    notificationService.stopRingtone();
    setActiveToast(null);
    try {
      await fetch("/api/calls/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", callId: incomingCall.callId }),
      });
    } catch (e) {}
    setIncomingCall(null);
  };

  // Save edited profile
  const handleSaveProfile = async (updated: {
    username: string;
    name: string;
    avatar: string;
    mood: string;
  }) => {
    localStorage.setItem("usly_username", updated.username);
    localStorage.setItem("usly_name", updated.name);
    localStorage.setItem("usly_avatar", updated.avatar);
    localStorage.setItem("usly_mood", updated.mood);

    setCurrentUser({
      username: updated.username,
      name: updated.name,
      avatar: updated.avatar,
      mood: updated.mood,
    });

    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      // Refresh conversations list to update sender avatar/name
      const convRes = await fetch(`/api/conversations?username=${updated.username}`);
      if (convRes.ok) {
        const data = await convRes.json();
        if (data.conversations) setContacts(data.conversations);
      }
    } catch (e) {
      console.error("Save profile error:", e);
    }
  };

  // Sign out helper
  const handleLogout = () => {
    localStorage.clear();
    signOut({ callbackUrl: "/login" });
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen h-[100dvh] bg-usly-dark flex items-center justify-center">
        <div className="animate-spin text-3xl">💖</div>
      </div>
    );
  }

  return (
    <div className={`h-[100dvh] max-h-[100dvh] flex flex-col bg-usly-dark text-white overflow-hidden ${isShaking ? "love-shake-effect" : ""}`}>
      {/* Floating Hearts Animation Engine */}
      <HeartEffect triggerHeart={triggerHeart} customEmojis={pingEmojis} />

      {/* Main Responsive Workspace */}
      <div className="flex-1 flex overflow-hidden w-full h-full relative">
        {/* LEFT SIDEBAR: Direct Messages, Requests, Search */}
        <aside
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex-col border-r border-white/10 glass-panel z-20 h-full overflow-hidden ${
            selectedUser ? "hidden md:flex" : "flex"
          }`}
        >
          {/* User Profile Header - Clickable to Edit */}
          <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between">
            <div
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center space-x-2.5 min-w-0 cursor-pointer p-1 -m-1 rounded-2xl hover:bg-white/5 transition active:scale-95 group"
              title="Click to edit profile & change avatar"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-10 h-10 rounded-full border-2 border-usly-pink/60 shadow-md group-hover:border-usly-pink transition object-cover"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-usly-dark" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white flex items-center space-x-1 truncate">
                  <span className="truncate">{currentUser.name}</span>
                  <Heart className="w-3 h-3 fill-usly-pink text-usly-pink flex-shrink-0" />
                </h2>
                <div className="flex items-center space-x-1 text-[11px] text-usly-coral/80 font-mono truncate">
                  <span className="truncate">@{currentUser.username}</span>
                  <span className="text-[10px] text-pink-300/70 font-sans group-hover:text-pink-300">✎ Edit</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1 flex-shrink-0">
              <button
                onClick={() => setActiveTab("search")}
                className={`p-2 rounded-xl transition ${
                  activeTab === "search"
                    ? "bg-usly-pink text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
                title="Search User / Send Request"
              >
                <UserPlus className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-white/10 transition"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs: Chats, Calls, Requests, Search */}
          <div className="flex border-b border-white/10 px-1 pt-1.5 bg-black/20">
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex-1 py-2 text-[11px] sm:text-xs font-bold text-center border-b-2 transition flex items-center justify-center space-x-1 ${
                activeTab === "messages"
                  ? "border-usly-pink text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Chats</span>
            </button>

            <button
              onClick={() => setActiveTab("calls")}
              className={`flex-1 py-2 text-[11px] sm:text-xs font-bold text-center border-b-2 transition flex items-center justify-center space-x-1 ${
                activeTab === "calls"
                  ? "border-usly-pink text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Calls</span>
            </button>

            <button
              onClick={() => setActiveTab("requests")}
              className={`flex-1 py-2 text-[11px] sm:text-xs font-bold text-center border-b-2 transition flex items-center justify-center space-x-1 relative ${
                activeTab === "requests"
                  ? "border-usly-pink text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Requests</span>
              <span className="sm:hidden">Req</span>
              {incomingRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-usly-pink text-[9px] text-white font-bold animate-pulse">
                  {incomingRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("search")}
              className={`flex-1 py-2 text-[11px] sm:text-xs font-bold text-center border-b-2 transition flex items-center justify-center space-x-1 ${
                activeTab === "search"
                  ? "border-usly-pink text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>

          {/* TAB 1: CHATS LIST */}
          {activeTab === "messages" && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {contacts.length === 0 ? (
                <div className="p-3 space-y-4">
                  <div className="text-center py-7 px-4 space-y-3 glass-panel rounded-2xl border border-usly-pink/30 shadow-lg">
                    <div className="text-3xl animate-float">💌</div>
                    <h4 className="text-xs font-bold text-white">No Active Chats Yet</h4>
                    <p className="text-[11px] text-zinc-300 leading-relaxed max-w-xs mx-auto">
                      Explore users and send connection requests. Once accepted, private chat and HD video calls will start here!
                    </p>
                    <button
                      onClick={() => setActiveTab("search")}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-love text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-95 transition"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Explore Users & Send Requests</span>
                    </button>
                  </div>
                </div>
              ) : (
                contacts
                  .filter((c) => !currentUser || c.username.toLowerCase() !== currentUser.username.toLowerCase())
                  .map((contact) => {
                  const isSelected = selectedUser?.username.toLowerCase() === contact.username.toLowerCase();
                  return (
                    <button
                      key={contact.username}
                      onClick={() => handleSelectContact(contact)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-2xl transition text-left ${
                        isSelected
                          ? "bg-usly-surface border border-usly-pink/40 shadow-md"
                          : "hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img
                          src={contact.avatar}
                          alt={contact.name}
                          className="w-11 h-11 rounded-full border border-usly-pink/30 object-cover"
                        />
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-usly-dark ${
                            contact.status === "online" ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-zinc-500"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
                            <h4 className={`text-sm font-bold truncate ${contact.unreadCount ? "text-white" : "text-white/90"}`}>
                              {contact.name}
                            </h4>
                            <span className="text-[10px] text-zinc-400 font-mono truncate hidden sm:inline">
                              @{contact.username}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            {contact.lastMessageTime && (
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {formatChatListTime(contact.lastMessageTime)}
                              </span>
                            )}
                            {(contact.unreadCount ?? 0) > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-usly-pink text-[10px] text-white font-black flex items-center justify-center shadow-md shadow-usly-pink/40">
                                {contact.unreadCount! > 99 ? "99+" : contact.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs truncate flex items-center">
                          <span className={`truncate font-medium ${
                            contact.unreadCount ? "text-white font-semibold" : "text-zinc-400"
                          }`}>
                            {contact.lastMessage || "Tap to start conversation ✨"}
                          </span>
                        </p>
                      </div>
                    </button>
                  );
                })
              )}

              {/* SECTION: NEW REQUESTS IN CHAT SECTION (AFTER ALL CHATS - 48 HOUR WINDOW) */}
              {incomingRequests.filter((r) => !getRemainingTime48h(r.createdAt).expired).length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-2.5 px-1">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-usly-pink animate-pulse" />
                      <span className="text-[11px] font-bold text-usly-coral uppercase tracking-wider">
                        New Requests
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-usly-pink/20 text-usly-coral font-bold font-mono">
                        48h window
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab("requests")}
                      className="text-[10px] text-pink-300 hover:text-white transition font-medium hover:underline"
                    >
                      View All ({incomingRequests.filter((r) => !getRemainingTime48h(r.createdAt).expired).length})
                    </button>
                  </div>

                  <div className="space-y-2">
                    {incomingRequests
                      .filter((req) => !getRemainingTime48h(req.createdAt).expired)
                      .map((req) => {
                        const timeLeft = getRemainingTime48h(req.createdAt);
                        const stableKey = req.senderUsername ? req.senderUsername.toLowerCase() : req.id;
                        return (
                          <div
                            key={`chat-req-${stableKey}`}
                            className="p-3 rounded-2xl bg-usly-surface/90 border border-usly-pink/40 shadow-lg shadow-usly-pink/5 space-y-2.5 relative overflow-hidden group hover:border-usly-pink transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={req.senderAvatar}
                                    alt={req.senderName}
                                    className="w-10 h-10 rounded-full border border-usly-pink/40 object-cover"
                                  />
                                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-usly-pink ring-1 ring-usly-dark" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-white truncate">{req.senderName}</h4>
                                  <span className="text-[10px] text-zinc-400 font-mono block truncate">
                                    @{req.senderUsername}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-usly-pink/15 border border-usly-pink/30 text-usly-coral text-[10px] font-bold font-mono">
                                <Clock className="w-3 h-3" />
                                <span>{timeLeft.text}</span>
                              </div>
                            </div>

                            {/* 48h expiration progress bar */}
                            <div className="space-y-1">
                              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-love rounded-full transition-all duration-300"
                                  style={{ width: `${timeLeft.percent}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 pt-0.5">
                              <button
                                onClick={() => handleAcceptRequest(req)}
                                className="flex-1 flex items-center justify-center space-x-1 py-1.5 rounded-xl bg-gradient-love hover:opacity-95 text-white text-xs font-bold shadow-md shadow-usly-pink/30 transition active:scale-95"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accept & Chat</span>
                              </button>
                              <button
                                onClick={() => handleDeclineRequest(req)}
                                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 transition active:scale-95"
                                title="Decline"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: CALLS HISTORY */}
          {activeTab === "calls" && currentUser && (
            <CallHistoryList
              currentUsername={currentUser.username}
              onStartCall={(partner, type) => {
                const targetContact: UserContact = contacts.find((c) => c.username.toLowerCase() === partner.username.toLowerCase()) || {
                  username: partner.username,
                  name: partner.name,
                  avatar: partner.avatar,
                  status: "online",
                };
                handleSelectContact(targetContact);
                if (type === "video") {
                  handleStartVideoCall(targetContact);
                } else {
                  handleStartAudioCall(targetContact);
                }
              }}
              onSelectChat={(partner) => {
                const targetContact: UserContact = contacts.find((c) => c.username.toLowerCase() === partner.username.toLowerCase()) || {
                  username: partner.username,
                  name: partner.name,
                  avatar: partner.avatar,
                  status: "online",
                };
                handleSelectContact(targetContact);
              }}
            />
          )}

          {/* TAB 2: INCOMING REQUESTS */}
          {activeTab === "requests" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="text-[11px] font-bold text-usly-coral uppercase tracking-wider">
                  Pending Requests ({incomingRequests.filter((r) => !getRemainingTime48h(r.createdAt).expired).length})
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-usly-pink/20 text-usly-coral font-bold font-mono">
                  Expires in 48h
                </span>
              </div>

              {incomingRequests.filter((r) => !getRemainingTime48h(r.createdAt).expired).length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-400 space-y-2">
                  <div className="text-2xl">✨</div>
                  <p>No pending requests.</p>
                  <p className="text-[11px] text-zinc-500">
                    When someone sends you a request, accept it here to start chatting!
                  </p>
                </div>
              ) : (
                incomingRequests
                  .filter((req) => !getRemainingTime48h(req.createdAt).expired)
                  .map((req) => {
                    const timeLeft = getRemainingTime48h(req.createdAt);
                    const stableKey = req.senderUsername ? req.senderUsername.toLowerCase() : req.id;
                    return (
                      <div
                        key={`req-tab-${stableKey}`}
                        className="p-3.5 rounded-2xl bg-usly-surface/80 border border-usly-pink/30 shadow-lg space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 min-w-0">
                            <img
                              src={req.senderAvatar}
                              alt={req.senderName}
                              className="w-11 h-11 rounded-full border border-usly-pink/40 object-cover flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-bold text-white truncate">{req.senderName}</h4>
                              <span className="text-xs text-zinc-400 font-mono block truncate">
                                @{req.senderUsername}
                              </span>
                              <p className="text-[10px] text-pink-300 mt-0.5">wants to connect with you</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-usly-pink/15 border border-usly-pink/30 text-usly-coral text-[11px] font-bold font-mono flex-shrink-0">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{timeLeft.text}</span>
                          </div>
                        </div>

                        {/* Expiration Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-love rounded-full transition-all duration-300"
                              style={{ width: `${timeLeft.percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 pt-1">
                          <button
                            onClick={() => handleAcceptRequest(req)}
                            className="flex-1 flex items-center justify-center space-x-1 py-2 rounded-xl bg-gradient-love hover:opacity-95 text-white text-xs font-bold shadow-md shadow-usly-pink/30 transition active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept & Chat</span>
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(req)}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 transition active:scale-95"
                            title="Decline"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {/* TAB 3: SEARCH USER & SEND REQUEST */}
          {activeTab === "search" && (
            <div className="flex-1 flex flex-col p-3 overflow-hidden">
              {/* Search Header Bar */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                      Explore Users
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-usly-pink/20 text-usly-coral font-bold font-mono">
                      {searchResults.filter((u) => !currentUser || u.username.toLowerCase() !== currentUser.username.toLowerCase()).length}
                    </span>
                  </div>
                  <button
                    onClick={() => fetchSearch()}
                    title="Refresh user list"
                    className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition text-[11px] flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or @username..."
                    className="w-full bg-usly-surface border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-usly-pink transition"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-2.5 p-1 text-zinc-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Users List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {searchResults.filter((u) => !currentUser || u.username.toLowerCase() !== currentUser.username.toLowerCase()).length === 0 ? (
                  <div className="text-center py-8 px-4 text-xs text-zinc-400 space-y-3 glass-panel rounded-2xl border border-white/5">
                    <div className="w-12 h-12 mx-auto rounded-full bg-usly-pink/10 flex items-center justify-center text-2xl">
                      👥
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-white text-xs">
                        {searchQuery ? `No users matching "${searchQuery}"` : "No other users online right now"}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Open Usly in another browser or incognito window to chat and test calls in realtime!
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          navigator.clipboard?.writeText(window.location.origin);
                          alert("App URL copied to clipboard! Share it with your partner or friend.");
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-love text-white text-xs font-bold shadow-md hover:opacity-95 transition"
                    >
                      📋 Copy Invite Link
                    </button>
                  </div>
                ) : (
                  searchResults
                    .filter((u) => !currentUser || u.username.toLowerCase() !== currentUser.username.toLowerCase())
                    .map((user) => {
                      const uUname = user.username.toLowerCase();
                      const hasSent = sentRequestUsernames.includes(uUname);
                      const isAlreadyContact = contacts.some((c) => c.username.toLowerCase() === uUname);
                      const incomingReq = incomingRequests.find((r) => r.senderUsername.toLowerCase() === uUname);
                      const isOnline = user.status === "online";

                      return (
                        <div
                          key={user.username}
                          className="flex flex-col p-2.5 rounded-2xl bg-usly-surface/70 border border-white/5 hover:border-usly-pink/40 transition group hover:shadow-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <div className="relative flex-shrink-0">
                                <img
                                  src={user.avatar}
                                  alt={user.name}
                                  className="w-10 h-10 rounded-full border border-usly-pink/20 object-cover"
                                />
                                <span
                                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-usly-dark ${
                                    isOnline ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-zinc-500"
                                  }`}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center space-x-1.5">
                                  <h4 className="text-xs font-bold text-white truncate">{user.name}</h4>
                                  {isOnline && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                                      LIVE
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-zinc-400 font-mono block truncate">
                                  @{user.username}
                                </span>
                                {user.mood && (
                                  <span className="text-[10px] text-usly-pink/80 truncate block">
                                    {user.mood}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Actions based on connection status */}
                            <div className="flex items-center space-x-1.5 flex-shrink-0">
                              {isAlreadyContact ? (
                                <>
                                  <button
                                    onClick={() => handleSelectContact(user)}
                                    title="Open chat"
                                    className="px-2.5 py-1.5 rounded-xl bg-usly-surface hover:bg-usly-pink/20 border border-usly-pink/40 text-usly-coral text-xs font-bold transition flex items-center space-x-1"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    <span>Chat</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleSelectContact(user);
                                      handleStartVideoCall(user);
                                    }}
                                    title="Start video call"
                                    className="p-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold transition"
                                  >
                                    <Video className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : incomingReq ? (
                                <button
                                  onClick={() => handleAcceptRequest(incomingReq)}
                                  className="px-2.5 py-1.5 rounded-xl bg-gradient-love hover:opacity-95 text-white text-xs font-bold shadow-md shadow-usly-pink/30 transition active:scale-95 flex items-center space-x-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Accept 💌</span>
                                </button>
                              ) : hasSent ? (
                                <button
                                  onClick={() => handleSendRequest(user)}
                                  title="Request already sent! Click to send ping / reminder 💖"
                                  className="px-2.5 py-1.5 rounded-xl bg-usly-pink/20 hover:bg-usly-pink/30 border border-usly-pink/40 text-usly-coral text-xs font-semibold transition active:scale-95 flex items-center space-x-1 shadow-sm"
                                >
                                  <Clock className="w-3 h-3 text-usly-pink animate-pulse" />
                                  <span>Requested 💖</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSendRequest(user)}
                                  className="px-3 py-1.5 rounded-xl bg-gradient-love text-white text-xs font-bold shadow-md hover:opacity-95 active:scale-95 transition flex items-center space-x-1"
                                >
                                  <Heart className="w-3 h-3 fill-white/20" />
                                  <span>Request 💖</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}

          {/* Database & Admin status footer */}
          <div className="p-3 border-t border-white/10 text-[10px] text-zinc-400 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Database className="w-3 h-3 text-usly-pink" />
              <span>Status:</span>
              <span className={dbStatus.isConnected ? "text-emerald-400 font-semibold" : "text-amber-300"}>
                {dbStatus.isConnected ? "MongoDB" : "Realtime"}
              </span>
            </div>
            <a
              href="/admin"
              className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-usly-pink/20 hover:text-white border border-white/10 text-zinc-300 font-mono transition text-[10px]"
            >
              Admin ⚙️
            </a>
          </div>
        </aside>

        {/* RIGHT CHAT AREA */}
        <section
          style={selectedUser ? CHAT_THEMES[currentThemeId]?.chatBgStyle : undefined}
          className={`flex-1 min-w-0 flex flex-col relative h-full overflow-hidden transition-colors duration-300 ${!selectedUser ? "hidden md:flex bg-usly-dark/80" : `flex ${CHAT_THEMES[currentThemeId]?.chatBg || "bg-[#0b0512]"}`}`}
        >
          {selectedUser ? (
            <>
              {/* Header with Call Controls & Instagram Chat Themes */}
              <div className="p-2 sm:px-4 sm:py-3 bg-black/70 backdrop-blur-xl border-b border-white/10 flex items-center justify-between z-10 flex-shrink-0">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 mr-2">
                  {/* Back / Close Chat Button */}
                  <button
                    onClick={() => {
                      userDismissedChatRef.current = true;
                      selectedUserRef.current = null;
                      setSelectedUser(null);
                      if (currentUser) {
                        localStorage.removeItem(`usly_active_partner_${currentUser.username.toLowerCase()}`);
                        localStorage.removeItem(`usly_last_active_partner_${currentUser.username.toLowerCase()}`);
                      }
                    }}
                    className="p-2 -ml-1 rounded-full bg-white/10 hover:bg-white/20 text-white flex-shrink-0 active:scale-90"
                    title="Back to all chats"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div className="relative flex-shrink-0">
                    <img
                      src={selectedUser.avatar}
                      alt={selectedUser.name}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/20 shadow-md object-cover"
                    />
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-base font-black text-white flex items-center space-x-1 truncate">
                      <span className="truncate">{selectedUser.name}</span>
                      <span className="text-[10px] text-zinc-400 font-normal hidden sm:inline">(@{selectedUser.username})</span>
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-zinc-400 font-medium flex items-center space-x-1 truncate">
                      <span className="text-emerald-400">●</span>
                      <span>{selectedUser.mood || "Active now"}</span>
                    </p>
                  </div>
                </div>

                {/* Instagram Call & Action Controls */}
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                  {/* Instagram Theme Switcher Button */}
                  <button
                    onClick={() => setIsThemeModalOpen(true)}
                    className="p-2 sm:px-3 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition active:scale-95 flex items-center space-x-1.5"
                    title="Change Instagram Chat Theme"
                  >
                    <Palette className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-semibold hidden md:inline">Theme</span>
                  </button>

                  {/* Audio Call */}
                  <button
                    onClick={() => handleStartAudioCall()}
                    className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition shadow-sm active:scale-90 flex items-center justify-center"
                    title="Start Voice Call"
                  >
                    <Phone className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>

                  {/* Video Call */}
                  <button
                    onClick={() => handleStartVideoCall()}
                    className="p-2 sm:px-3.5 sm:py-2 rounded-full bg-gradient-love hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-pink-500/30 transition active:scale-90 flex items-center space-x-1"
                    title="Start HD Video Call"
                  >
                    <Video className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                    <span className="hidden sm:inline">Call</span>
                  </button>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <MessageList
                  key={`msglist_${selectedUser.username.toLowerCase()}`}
                  messages={messages}
                  currentUsername={currentUser.username}
                  partnerUsername={selectedUser.username}
                  partnerName={selectedUser.name}
                  partnerAvatar={selectedUser.avatar}
                  themeId={currentThemeId}
                  onAddReaction={handleAddReaction}
                />

                {/* Message Input with Instagram DM style & Theme support */}
                <MessageInput
                  key={`msginput_${selectedUser.username.toLowerCase()}`}
                  onSendMessage={handleSendMessage}
                  onSendLovePing={handleSendLovePing}
                  themeId={currentThemeId}
                />
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-gradient-love p-1 shadow-2xl shadow-usly-pink/40 flex items-center justify-center animate-float">
                <div className="w-full h-full bg-usly-dark rounded-full flex items-center justify-center">
                  <MessageCircle className="w-10 h-10 text-usly-pink" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">Your Direct Messages</h2>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-sm">
                Search for a user to send a request, accept requests, and start 1-on-1 private messaging and HD video calls.
              </p>
              <button
                onClick={() => setActiveTab("search")}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-2xl bg-gradient-love text-white font-bold text-xs shadow-lg shadow-usly-pink/30 hover:opacity-95 transition active:scale-95"
              >
                <Search className="w-4 h-4" />
                <span>Search Users</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* WebRTC Video / Voice Call Overlay */}
      {activeCall && (
        <CallModal
          callId={activeCall.callId}
          isCaller={activeCall.isCaller}
          callType={activeCall.type}
          myUsername={currentUser.username}
          myName={currentUser.name}
          myAvatar={currentUser.avatar}
          partnerName={activeCall.partnerName || selectedUser?.name || "Partner"}
          partnerUsername={activeCall.partnerUsername || selectedUser?.username || "partner"}
          onEndCall={() => {
            setActiveCall(null);
            setIncomingCall(null);
            setActiveToast(null);
            ringingCallIdRef.current = null;
            notificationService.stopRingtone();
          }}
          onTriggerFloatingHeart={() => setTriggerHeart(Date.now())}
        />
      )}

      {/* Incoming Call Ringing Alert */}
      {incomingCall && !activeCall && (
        <IncomingCallAlert
          key={incomingCall.callId}
          callerName={incomingCall.callerName}
          callerUsername={incomingCall.callerUsername}
          callerAvatar={incomingCall.callerAvatar}
          callType={incomingCall.type}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      {/* In-App Floating Toast Notification */}
      <NotificationToast
        notification={activeToast}
        onDismiss={() => setActiveToast(null)}
        onSelectUser={(user) => {
          const matched = contacts.find((c) => c.username.toLowerCase() === user.username.toLowerCase()) || {
            username: user.username,
            name: user.name,
            avatar: user.avatar,
            status: "online" as const,
          };
          handleSelectContact(matched);
        }}
      />

      {/* Profile Edit & Avatar Customizer Modal */}
      {currentUser && isProfileModalOpen && (
        <ProfileEditModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onSaveProfile={handleSaveProfile}
        />
      )}

      {/* Romantic Ping Variety Picker Modal */}
      <PingPickerModal
        isOpen={isPingModalOpen}
        onClose={() => setIsPingModalOpen(false)}
        onSelectPing={(ping) => handleSendLovePing(ping)}
        partnerName={selectedUser?.name || "Partner"}
      />

      {/* Instagram Chat Theme Selector Modal */}
      <ThemePickerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentThemeId={currentThemeId}
        onSelectTheme={(newTheme) => {
          setCurrentThemeId(newTheme);
          localStorage.setItem("usly_chat_theme", newTheme);
        }}
      />
    </div>
  );
}
