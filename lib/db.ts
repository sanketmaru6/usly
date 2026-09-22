import mongoose from "mongoose";

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    isConnected: boolean;
  };
}

let cached = global.mongooseCache;

if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null, isConnected: false };
}

export async function connectToDatabase(): Promise<{ isConnected: boolean; error?: string }> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI || MONGODB_URI.includes("<db_password>")) {
    // Database password placeholder hasn't been replaced yet or URI missing
    return {
      isConnected: false,
      error: "MongoDB URI has placeholder <db_password>. Please update your database password in .env.local",
    };
  }

  if (cached.conn) {
    return { isConnected: true };
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      cached.isConnected = true;
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    cached.isConnected = true;
    return { isConnected: true };
  } catch (e: any) {
    cached.promise = null;
    cached.isConnected = false;
    console.error("Failed to connect to MongoDB:", e.message);
    return { isConnected: false, error: e.message };
  }
}
