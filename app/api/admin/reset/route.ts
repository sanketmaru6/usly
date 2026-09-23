import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Message } from "@/lib/models/Message";
import { CallSession } from "@/lib/models/CallSession";
import { FriendRequest } from "@/lib/models/FriendRequest";
import { signalingStore } from "@/lib/signalingStore";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const stats: Record<string, any> = {
      inMemoryCleared: true,
      dbCleared: false,
    };

    // 1. Wipe in-memory state
    signalingStore.clearAll();

    // 2. Wipe database if connected
    const dbRes = await connectToDatabase();
    if (dbRes.isConnected && mongoose.connection.db) {
      const usersDeleted = await User.deleteMany({});
      const messagesDeleted = await Message.deleteMany({});
      const callsDeleted = await CallSession.deleteMany({});
      const requestsDeleted = await FriendRequest.deleteMany({});

      stats.dbCleared = true;
      stats.usersDeleted = usersDeleted.deletedCount;
      stats.messagesDeleted = messagesDeleted.deletedCount;
      stats.callsDeleted = callsDeleted.deletedCount;
      stats.requestsDeleted = requestsDeleted.deletedCount;
    } else {
      stats.dbError = dbRes.error || "Database not connected";
    }

    return NextResponse.json({
      success: true,
      message: "All user data, messages, calls, and requests have been wiped.",
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to wipe data" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
