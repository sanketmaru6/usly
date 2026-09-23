"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Trash2,
  Search,
  RefreshCw,
  ArrowLeft,
  ShieldAlert,
  Database,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Sparkles,
  UserX,
} from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  coupleCode?: string;
  status: "online" | "offline" | "busy" | "in_call";
  mood?: string;
  createdAt?: string;
  source?: "database" | "memory";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [dbStatus, setDbStatus] = useState<boolean>(false);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users);
          setDbStatus(data.dbConnected);
        }
      }
    } catch (e: any) {
      showToast("error", "Failed to fetch users: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeleteUser = async (user: AdminUser) => {
    try {
      setDeletingUsername(user.username);
      const res = await fetch(`/api/admin/users?username=${encodeURIComponent(user.username)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", `User @${user.username} removed successfully.`);
        setUsers((prev) => prev.filter((u) => u.username.toLowerCase() !== user.username.toLowerCase()));
        setConfirmUser(null);
      } else {
        showToast("error", data.error || "Failed to remove user");
      }
    } catch (e: any) {
      showToast("error", e.message || "Error removing user");
    } finally {
      setDeletingUsername(null);
    }
  };

  const handleResetAllData = async () => {
    try {
      setIsResetting(true);
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("success", "All users, messages, and calls have been wiped.");
        setUsers([]);
        setConfirmReset(false);
      } else {
        showToast("error", data.error || "Failed to reset database");
      }
    } catch (e: any) {
      showToast("error", e.message || "Error resetting database");
    } finally {
      setIsResetting(false);
    }
  };

  const onlineCount = users.filter((u) => u.status === "online").length;

  return (
    <main className="min-h-screen bg-usly-dark text-white p-4 sm:p-8 font-sans selection:bg-usly-pink selection:text-white relative overflow-x-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-usly-pink/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-usly-coral/10 rounded-full blur-3xl pointer-events-none" />

      {/* Floating Toast */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
            toastMessage.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : "bg-rose-950/90 border-rose-500/50 text-rose-300"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        {/* Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <Link
              href="/chat"
              className="p-2.5 rounded-2xl bg-usly-surface/80 border border-white/10 hover:border-usly-pink/40 text-zinc-300 hover:text-white transition flex items-center space-x-1.5 text-xs font-bold shadow-sm active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Chat</span>
            </Link>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-black bg-gradient-to-r from-usly-pink via-pink-400 to-usly-coral bg-clip-text text-transparent">
                  Usly
                </span>
                <span className="px-2 py-0.5 rounded-full bg-usly-pink/20 text-usly-coral text-[10px] font-mono font-bold tracking-wider uppercase border border-usly-pink/30">
                  Admin Console
                </span>
              </div>
              <p className="text-xs text-zinc-400">Manage registered users and active database accounts</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchUsers()}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-usly-surface border border-white/10 hover:border-usly-pink/40 text-xs font-semibold text-zinc-200 transition flex items-center space-x-1.5 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-usly-pink" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-bold transition flex items-center space-x-1.5 active:scale-95"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Wipe All Data</span>
            </button>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-3xl glass-panel border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
              <span>Total Registered Users</span>
              <Users className="w-4 h-4 text-usly-pink" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">{users.length}</div>
            <p className="text-[11px] text-zinc-400">All registered profiles in Usly</p>
          </div>

          <div className="p-4 rounded-3xl glass-panel border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
              <span>Online Now</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">{onlineCount}</div>
            <p className="text-[11px] text-zinc-400">Active realtime chat sessions</p>
          </div>

          <div className="p-4 rounded-3xl glass-panel border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-medium">
              <span>Database State</span>
              <Database className="w-4 h-4 text-usly-coral" />
            </div>
            <div className="text-lg sm:text-xl font-bold flex items-center space-x-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${dbStatus ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className={dbStatus ? "text-emerald-300" : "text-amber-300"}>
                {dbStatus ? "MongoDB Connected" : "In-Memory Active"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">User accounts & live signaling</p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 rounded-3xl glass-panel border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username, name, or email..."
              className="w-full bg-usly-surface/90 border border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-usly-pink transition"
            />
          </div>
          <div className="text-xs text-zinc-400 font-mono">
            Showing <span className="text-white font-bold">{users.length}</span> user(s)
          </div>
        </div>

        {/* Users Table / List */}
        <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
          {loading && users.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-usly-pink" />
              <p className="text-xs font-semibold">Loading users list...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-zinc-400 space-y-3">
              <UserX className="w-10 h-10 mx-auto text-zinc-500" />
              <p className="text-sm font-bold text-white">No Users Found</p>
              <p className="text-xs text-zinc-400">
                {searchQuery ? `No users matching "${searchQuery}"` : "No registered user accounts yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                    <th className="py-3.5 px-4">User</th>
                    <th className="py-3.5 px-4 hidden md:table-cell">Email / Handle</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 hidden sm:table-cell">Mood</th>
                    <th className="py-3.5 px-4 hidden lg:table-cell">Registered</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((user) => (
                    <tr key={user.username} className="hover:bg-white/5 transition-colors group">
                      {/* User Avatar & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative flex-shrink-0">
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-10 h-10 rounded-full border border-usly-pink/30 object-cover"
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-usly-dark ${
                                user.status === "online" ? "bg-emerald-400" : "bg-zinc-500"
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-white text-xs sm:text-sm truncate flex items-center space-x-1.5">
                              <span>{user.name}</span>
                              {user.source === "memory" && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                                  LIVE
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-400 font-mono block truncate">
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email & Handle */}
                      <td className="py-3 px-4 hidden md:table-cell text-zinc-300 font-mono text-[11px]">
                        {user.email || `${user.username}@usly.app`}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                            user.status === "online"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.status === "online" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                            }`}
                          />
                          <span>{user.status === "online" ? "Online" : "Offline"}</span>
                        </span>
                      </td>

                      {/* Mood */}
                      <td className="py-3 px-4 hidden sm:table-cell text-zinc-300 text-[11px] truncate max-w-xs">
                        {user.mood || "Ready to chat ✨"}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 hidden lg:table-cell text-zinc-400 font-mono text-[10px]">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Recent"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setConfirmUser(user)}
                          disabled={deletingUsername === user.username}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold transition active:scale-95 flex items-center space-x-1.5 ml-auto"
                          title="Remove user account and all chat data"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Confirm Single User Deletion */}
      {confirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-usly-surface border border-rose-500/40 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Remove User Account</h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-black/40 border border-white/5 flex items-center space-x-3">
              <img
                src={confirmUser.avatar}
                alt={confirmUser.name}
                className="w-11 h-11 rounded-full border border-usly-pink/30 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">{confirmUser.name}</div>
                <div className="text-xs text-zinc-400 font-mono">@{confirmUser.username}</div>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">@{confirmUser.username}</strong>? This
              will permanently remove their user record, messages, friend requests, and call history.
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setConfirmUser(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-zinc-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(confirmUser)}
                disabled={deletingUsername === confirmUser.username}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-900/30"
              >
                {deletingUsername === confirmUser.username ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm Entire Database Wipe */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-usly-surface border border-rose-500/60 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40">
                <ShieldAlert className="w-7 h-7 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Wipe All App Data</h3>
                <p className="text-xs text-rose-300 font-medium">Critical Administrative Action</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 leading-relaxed space-y-1">
              <p className="font-bold text-white">Warning: Permanent Data Erasure</p>
              <p>This will erase all users, connection requests, chat messages, and call records from the database and active memory.</p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setConfirmReset(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-zinc-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllData}
                disabled={isResetting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-900/40"
              >
                {isResetting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Yes, Wipe Everything</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
