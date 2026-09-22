import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFriendRequest extends Document {
  senderUsername: string;
  senderName: string;
  senderAvatar?: string;
  receiverUsername: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Date;
  updatedAt: Date;
}

const FriendRequestSchema = new Schema<IFriendRequest>(
  {
    senderUsername: { type: String, required: true, lowercase: true, index: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: "" },
    receiverUsername: { type: String, required: true, lowercase: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
  },
  { timestamps: true }
);

FriendRequestSchema.index({ receiverUsername: 1, status: 1 });
FriendRequestSchema.index({ senderUsername: 1, receiverUsername: 1 });

export const FriendRequest: Model<IFriendRequest> =
  mongoose.models.FriendRequest || mongoose.model<IFriendRequest>("FriendRequest", FriendRequestSchema);
