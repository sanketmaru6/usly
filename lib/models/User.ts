import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  googleId?: string;
  email?: string;
  name: string;
  username: string; // "usly" username
  avatar?: string;
  partnerId?: mongoose.Types.ObjectId | string;
  coupleCode?: string; // 6-char code for pairing
  status: "online" | "offline" | "busy" | "in_call";
  mood: string; // e.g. "Missing you ❤️", "Thinking about you 🥰"
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    googleId: { type: String, sparse: true, index: true },
    email: { type: String, lowercase: true, sparse: true, index: true },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    avatar: { type: String, default: "" },
    partnerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    coupleCode: { type: String, sparse: true, index: true },
    status: { type: String, enum: ["online", "offline", "busy", "in_call"], default: "online" },
    mood: { type: String, default: "In love 🥰" },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
