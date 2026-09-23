import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local if present
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI;

async function wipeDatabase() {
  if (!MONGODB_URI) {
    console.error("❌ Error: MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  if (MONGODB_URI.includes("<db_password>")) {
    console.error("❌ Error: MongoDB URI contains '<db_password>' placeholder. Please configure your actual password in .env.local.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(" Connected to MongoDB successfully.");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collection(s):`, collections.map((c) => c.name));

    for (const col of collections) {
      const colName = col.name;
      // Skip system collections if any
      if (colName.startsWith("system.")) continue;

      const collection = db.collection(colName);
      const countBefore = await collection.countDocuments();
      const deleteResult = await collection.deleteMany({});
      console.log(`🗑️ Cleared collection '${colName}': deleted ${deleteResult.deletedCount} of ${countBefore} documents.`);
    }

    console.log("\n All user data, messages, call sessions, and friend requests have been wiped successfully!");
  } catch (err) {
    console.error("❌ Failed to wipe database:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

wipeDatabase();
