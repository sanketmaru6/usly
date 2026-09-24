import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models/User";
import { signalingStore } from "@/lib/signalingStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const email = searchParams.get("email");

  if (!username && !email) {
    return NextResponse.json({ error: "Username or email required" }, { status: 400 });
  }

  const dbRes = await connectToDatabase();
  if (dbRes.isConnected) {
    try {
      const query: any = {};
      if (username) query.username = username.toLowerCase().trim();
      if (email) query.email = email.toLowerCase().trim();

      const user = await User.findOne(query).populate("partnerId", "name username avatar status mood lastSeen coupleCode");
      if (user) {
        const presence = signalingStore.getUser(user.username) || { status: user.status, mood: user.mood };
        return NextResponse.json({
          user: {
            id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            coupleCode: user.coupleCode,
            partner: user.partnerId,
            status: presence.status || user.status,
            mood: presence.mood || user.mood,
          },
          dbConnected: true,
        });
      }
    } catch (err: any) {
      console.error("Profile GET error:", err.message);
    }
  }

  // In-memory fallback
  const uname = username || (email ? email.split("@")[0] : "usly_love");
  const presence = signalingStore.getUser(uname) || { status: "online", mood: "In love 🥰" };
  return NextResponse.json({
    user: {
      id: `dev_${uname}`,
      name: uname.charAt(0).toUpperCase() + uname.slice(1),
      username: uname,
      email: email || `${uname}@usly.app`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uname}`,
      coupleCode: "USLY88",
      status: presence.status || "online",
      mood: presence.mood || "In love 🥰",
    },
    dbConnected: dbRes.isConnected,
    dbError: dbRes.error,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, name, email, avatar, mood, status } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-zA-Z0-9_]/g, "");

    // Register in memory
    signalingStore.registerUser({
      username: cleanUsername,
      name: name || cleanUsername,
      avatar,
      mood: mood || "In love 🥰",
      status: (status as any) || "online",
    });

    const dbRes = await connectToDatabase();
    if (dbRes.isConnected) {
      try {
        const orConditions: any[] = [{ username: cleanUsername }];
        if (email && email.trim()) {
          orConditions.push({ email: email.toLowerCase().trim() });
        }

        let user = await User.findOne({ $or: orConditions });

        if (!user) {
          const coupleCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          user = await User.create({
            username: cleanUsername,
            name: name || cleanUsername,
            email: email?.toLowerCase() || `${cleanUsername}@usly.app`,
            avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
            coupleCode,
            mood: mood || "In love 🥰",
            status: status || "online",
          });
        } else {
          user.username = cleanUsername;
          if (name && name.trim() && name !== cleanUsername) {
            user.name = name;
          }
          // Only update avatar if new avatar is explicitly provided and not just a generic placeholder when a custom one exists
          if (avatar && (!user.avatar || !avatar.startsWith("https://api.dicebear.com") || user.avatar.startsWith("https://api.dicebear.com"))) {
            user.avatar = avatar;
          }
          if (mood) user.mood = mood;
          if (status) user.status = status;
          await user.save();
        }

        return NextResponse.json({
          success: true,
          user: {
            id: user._id.toString(),
            username: user.username,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            coupleCode: user.coupleCode,
            mood: user.mood,
            status: user.status,
          },
          dbConnected: true,
        });
      } catch (err: any) {
        console.error("Profile save error:", err.message);
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: `dev_${cleanUsername}`,
        username: cleanUsername,
        name: name || cleanUsername,
        email: email || `${cleanUsername}@usly.app`,
        avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
        coupleCode: "USLY88",
        mood: mood || "In love 🥰",
        status: status || "online",
      },
      dbConnected: dbRes.isConnected,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
