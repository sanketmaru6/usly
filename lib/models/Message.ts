import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage extends Document {
  senderId?: string;
  senderUsername: string;
  senderName?: string;
  senderAvatar?: string;
  receiverUsername: string;
  receiverId?: string;
  type: "text" | "voice" | "image" | "love_ping" | "sticker" | "question";
  content: string;
  audioDuration?: number;
  reactions: Array<{
    user: string;
    emoji: string;
  }>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    senderId: { type: String, default: "" },
    senderUsername: { type: String, required: true, lowercase: true, index: true },
    senderName: { type: String, default: "" },
    senderAvatar: { type: String, default: "" },
    receiverUsername: { type: String, required: true, lowercase: true, index: true },
    receiverId: { type: String, default: "" },
    type: {
      type: String,
      enum: ["text", "voice", "image", "love_ping", "sticker", "question"],
      default: "text",
    },
    content: { type: String, required: true },
    audioDuration: { type: Number, default: 0 },
    reactions: [
      {
        user: { type: String, required: true },
        emoji: { type: String, required: true },
      },
    ],
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ senderUsername: 1, receiverUsername: 1, createdAt: 1 });
MessageSchema.index({ receiverUsername: 1, senderUsername: 1, createdAt: 1 });

if (mongoose.models?.Message) {
  delete (mongoose.models as any).Message;
}

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);

