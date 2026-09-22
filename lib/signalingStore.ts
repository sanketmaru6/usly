// Real-time state store with user search, connection requests, messaging and WebRTC calling
import { EventEmitter } from "events";

export interface LiveSignal {
  callId: string;
  callerId: string;
  callerName: string;
  callerUsername: string;
  callerAvatar?: string;
  receiverId: string;
  receiverUsername: string;
  type: "audio" | "video";
  status: "ringing" | "accepted" | "declined" | "ended" | "missed";
  durationSeconds?: number;
  offer?: any;
  answer?: any;
  callerCandidates: any[];
  receiverCandidates: any[];
  updatedAt: number;
}

export interface LiveMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderName: string;
  receiverUsername: string;
  coupleCode?: string;
  type: "text" | "voice" | "image" | "love_ping" | "sticker" | "question";
  content: string;
  audioDuration?: number;
  reactions: Array<{ user: string; emoji: string }>;
  createdAt: string;
}

export interface LiveRequest {
  id: string;
  senderUsername: string;
  senderName: string;
  senderAvatar: string;
  receiverUsername: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface LiveUser {
  username: string;
  name: string;
  avatar: string;
  status: "online" | "offline" | "busy";
  mood: string;
  lastSeen: number;
}

// Global cache to persist across hot reloads in Next.js development
declare global {
  var liveSignals: Map<string, LiveSignal>;
  var liveMessages: LiveMessage[];
  var liveRequests: LiveRequest[];
  var liveUsers: Map<string, LiveUser>;
  var signalingEmitter: EventEmitter;
}

if (!global.liveSignals) {
  global.liveSignals = new Map();
}
if (!global.liveMessages) {
  global.liveMessages = [];
}
if (!global.liveRequests) {
  global.liveRequests = [];
}
if (!global.signalingEmitter) {
  global.signalingEmitter = new EventEmitter();
  global.signalingEmitter.setMaxListeners(500);
}
export const signalingEmitter = global.signalingEmitter;

if (!global.liveUsers) {
  global.liveUsers = new Map();
}

export const signalingStore = {
  // User directory & search
  registerUser(user: { username: string; name: string; avatar?: string; status?: "online" | "offline" | "busy"; mood?: string }) {
    const uname = user.username.toLowerCase().trim();
    const existing = global.liveUsers.get(uname);
    const updated: LiveUser = {
      username: uname,
      name: user.name || (existing ? existing.name : uname),
      avatar: user.avatar || (existing ? existing.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${uname}`),
      status: user.status || "online",
      mood: user.mood || (existing ? existing.mood : "In love 🥰"),
      lastSeen: Date.now(),
    };
    global.liveUsers.set(uname, updated);
    return updated;
  },

  searchUsers(query: string, excludeUsername: string) {
    const q = query.toLowerCase().trim();
    const exclude = excludeUsername.toLowerCase().trim();
    const results: LiveUser[] = [];

    const users = Array.from(global.liveUsers.values());
    for (const u of users) {
      if (u.username === exclude) continue;
      if (!q || u.username.includes(q) || u.name.toLowerCase().includes(q)) {
        results.push(u);
      }
    }
    return results;
  },

  getUser(username: string): LiveUser | null {
    return global.liveUsers.get(username.toLowerCase().trim()) || null;
  },

  // Connection Requests
  sendRequest(senderUsername: string, senderName: string, senderAvatar: string, receiverUsername: string) {
    const sUname = senderUsername.toLowerCase().trim();
    const rUname = receiverUsername.toLowerCase().trim();

    const existing = global.liveRequests.find(
      (r) =>
        (r.senderUsername === sUname && r.receiverUsername === rUname) ||
        (r.senderUsername === rUname && r.receiverUsername === sUname)
    );

    if (existing) {
      if (existing.status === "declined") {
        existing.status = "pending";
        existing.createdAt = new Date().toISOString();
      }
      signalingEmitter.emit("request:" + rUname, existing);
      return existing;
    }

    const req: LiveRequest = {
      id: "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      senderUsername: sUname,
      senderName,
      senderAvatar: senderAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sUname}`,
      receiverUsername: rUname,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    global.liveRequests.unshift(req);
    signalingEmitter.emit("request:" + rUname, req);
    return req;
  },

  acceptRequest(requestId: string) {
    const req = global.liveRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = "accepted";
      signalingEmitter.emit("request_update:" + req.senderUsername, req);
      signalingEmitter.emit("request_update:" + req.receiverUsername, req);
      return req;
    }
    return null;
  },

  declineRequest(requestId: string) {
    const req = global.liveRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = "declined";
      signalingEmitter.emit("request_update:" + req.senderUsername, req);
      signalingEmitter.emit("request_update:" + req.receiverUsername, req);
      return req;
    }
    return null;
  },

  getRequestsForUser(username: string) {
    const uname = username.toLowerCase().trim();
    return {
      incomingPending: global.liveRequests.filter(
        (r) => r.receiverUsername === uname && r.status === "pending"
      ),
      outgoingPending: global.liveRequests.filter(
        (r) => r.senderUsername === uname && r.status === "pending"
      ),
      acceptedConnections: global.liveRequests.filter(
        (r) => (r.receiverUsername === uname || r.senderUsername === uname) && r.status === "accepted"
      ),
    };
  },

  // Calling management with Instant Event Dispatch
  createCall(call: Omit<LiveSignal, "callerCandidates" | "receiverCandidates" | "updatedAt">) {
    const callerU = call.callerUsername.toLowerCase().trim();
    const receiverU = call.receiverUsername.toLowerCase().trim();

    // Clean up any stale calls between these two users to avoid race conditions
    for (const [id, existing] of global.liveSignals.entries()) {
      const eCaller = existing.callerUsername.toLowerCase().trim();
      const eReceiver = existing.receiverUsername.toLowerCase().trim();
      if (
        (eCaller === callerU && eReceiver === receiverU) ||
        (eCaller === receiverU && eReceiver === callerU)
      ) {
        if (id !== call.callId) {
          global.liveSignals.delete(id);
        }
      }
    }

    const fullCall: LiveSignal = {
      ...call,
      callerCandidates: [],
      receiverCandidates: [],
      updatedAt: Date.now(),
    };
    global.liveSignals.set(call.callId, fullCall);

    // Broadcast instant ring event to receiver and caller
    signalingEmitter.emit("call:" + call.receiverUsername.toLowerCase().trim(), {
      type: "incoming_call",
      call: fullCall,
    });
    signalingEmitter.emit("call_update:" + call.callId, fullCall);

    return fullCall;
  },

  getCall(callId: string) {
    return global.liveSignals.get(callId) || null;
  },

  findActiveCallForUser(username: string) {
    const normalized = username.toLowerCase().trim();
    // Sort calls newest first
    const calls = Array.from(global.liveSignals.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    for (const call of calls) {
      if (
        (call.receiverUsername.toLowerCase() === normalized ||
          call.callerUsername.toLowerCase() === normalized) &&
        (call.status === "ringing" || call.status === "accepted")
      ) {
        // Auto-expire old unanswered ringing calls older than 45 seconds
        if (call.status === "ringing" && Date.now() - (call.updatedAt || 0) > 45000) {
          call.status = "missed";
          continue;
        }
        return call;
      }
    }
    return null;
  },

  updateCall(callId: string, updates: Partial<LiveSignal>) {
    const existing = global.liveSignals.get(callId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    global.liveSignals.set(callId, updated);

    // Broadcast instant update to all listeners for this callId and both users
    signalingEmitter.emit("call_update:" + callId, updated);
    signalingEmitter.emit("call:" + updated.callerUsername.toLowerCase().trim(), {
      type: "call_update",
      call: updated,
    });
    signalingEmitter.emit("call:" + updated.receiverUsername.toLowerCase().trim(), {
      type: "call_update",
      call: updated,
    });

    return updated;
  },

  addCandidate(callId: string, candidate: any, isCaller: boolean) {
    const call = global.liveSignals.get(callId);
    if (!call) return false;
    if (isCaller) {
      call.callerCandidates.push(candidate);
    } else {
      call.receiverCandidates.push(candidate);
    }
    call.updatedAt = Date.now();

    signalingEmitter.emit("candidate:" + callId, { candidate, isCaller });
    signalingEmitter.emit("call_update:" + callId, call);
    return true;
  },

  endCall(callId: string) {
    const call = global.liveSignals.get(callId);
    if (call) {
      call.status = "ended";
      call.updatedAt = Date.now();
      signalingEmitter.emit("call_update:" + callId, call);
      signalingEmitter.emit("call:" + call.callerUsername.toLowerCase().trim(), {
        type: "call_ended",
        call,
      });
      signalingEmitter.emit("call:" + call.receiverUsername.toLowerCase().trim(), {
        type: "call_ended",
        call,
      });
    }
  },

  // Real-time messages store
  addMessage(msg: LiveMessage) {
    global.liveMessages.push(msg);
    if (global.liveMessages.length > 2000) {
      global.liveMessages.shift();
    }
    signalingEmitter.emit("message:" + (msg.receiverUsername || "").toLowerCase().trim(), msg);
    signalingEmitter.emit("message_sent:" + (msg.senderUsername || "").toLowerCase().trim(), msg);
    return msg;
  },

  getMessagesBetween(user1: string, user2: string) {
    const u1 = user1.toLowerCase().trim();
    const u2 = user2.toLowerCase().trim();

    return global.liveMessages.filter((m) => {
      const sender = m.senderUsername.toLowerCase();
      const receiver = (m.receiverUsername || "").toLowerCase();
      return (sender === u1 && receiver === u2) || (sender === u2 && receiver === u1);
    });
  },

  // Get all conversation threads for a user with last message preview
  getConversationsForUser(username: string) {
    const uname = username.toLowerCase().trim();
    const conversationsMap = new Map<
      string,
      {
        username: string;
        name: string;
        avatar: string;
        lastMessage: string;
        lastMessageType: string;
        lastMessageTime: string;
        unreadCount: number;
        status: "online" | "offline" | "busy";
      }
    >();

    // 1. Gather from messages
    for (let i = global.liveMessages.length - 1; i >= 0; i--) {
      const msg = global.liveMessages[i];
      const sender = (msg.senderUsername || "").toLowerCase();
      const receiver = (msg.receiverUsername || "").toLowerCase();

      if (sender === uname || receiver === uname) {
        const partnerUname = sender === uname ? receiver : sender;
        if (partnerUname && !conversationsMap.has(partnerUname)) {
          const partnerUser = global.liveUsers.get(partnerUname);
          const partnerName =
            partnerUser?.name ||
            (sender === uname ? partnerUname : msg.senderName) ||
            partnerUname;
          const partnerAvatar =
            partnerUser?.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`;

          let preview = msg.content;
          if (msg.type === "love_ping") preview = "💖 Sent a Love Ping!";
          else if (msg.type === "voice") preview = `🎤 Voice note (${msg.audioDuration || 3}s)`;
          else if (msg.type === "sticker") preview = "✨ Sticker";

          conversationsMap.set(partnerUname, {
            username: partnerUname,
            name: partnerName,
            avatar: partnerAvatar,
            lastMessage: preview,
            lastMessageType: msg.type || "text",
            lastMessageTime: msg.createdAt,
            unreadCount: 0,
            status: partnerUser?.status || "online",
          });
        }
      }
    }

    // 2. Gather from accepted requests
    for (const req of global.liveRequests) {
      if (req.status === "accepted") {
        const sender = req.senderUsername.toLowerCase();
        const receiver = req.receiverUsername.toLowerCase();

        if (sender === uname || receiver === uname) {
          const partnerUname = sender === uname ? receiver : sender;
          if (partnerUname && !conversationsMap.has(partnerUname)) {
            const partnerUser = global.liveUsers.get(partnerUname);
            const partnerName = partnerUser?.name || req.senderName || partnerUname;
            const partnerAvatar =
              partnerUser?.avatar ||
              req.senderAvatar ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${partnerUname}`;

            conversationsMap.set(partnerUname, {
              username: partnerUname,
              name: partnerName,
              avatar: partnerAvatar,
              lastMessage: "Connected! Click to chat ✨",
              lastMessageType: "text",
              lastMessageTime: req.createdAt,
              unreadCount: 0,
              status: partnerUser?.status || "online",
            });
          }
        }
      }
    }

    return Array.from(conversationsMap.values());
  },

  addReaction(messageId: string, user: string, emoji: string) {
    const msg = global.liveMessages.find((m) => m.id === messageId);
    if (msg) {
      const existingReactionIndex = msg.reactions.findIndex((r) => r.user === user);
      if (existingReactionIndex > -1) {
        if (msg.reactions[existingReactionIndex].emoji === emoji) {
          msg.reactions.splice(existingReactionIndex, 1);
        } else {
          msg.reactions[existingReactionIndex].emoji = emoji;
        }
      } else {
        msg.reactions.push({ user, emoji });
      }
      return msg;
    }
    return null;
  },
};

