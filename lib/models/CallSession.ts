import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICallSession extends Document {
  callId: string;
  callerId: string;
  callerName: string;
  callerUsername: string;
  callerAvatar?: string;
  receiverId: string;
  receiverName: string;
  receiverUsername: string;
  receiverAvatar?: string;
  type: "audio" | "video";
  status: "ringing" | "accepted" | "declined" | "ended" | "missed";
  durationSeconds?: number;
  offer?: any;
  answer?: any;
  callerCandidates: any[];
  receiverCandidates: any[];
  lastReaction?: { emoji: string; timestamp: number };
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CallSessionSchema = new Schema<ICallSession>(
  {
    callId: { type: String, required: true, unique: true, index: true },
    callerId: { type: String, default: "" },
    callerName: { type: String, required: true },
    callerUsername: { type: String, required: true, lowercase: true, index: true },
    callerAvatar: { type: String, default: "" },
    receiverId: { type: String, default: "" },
    receiverName: { type: String, default: "" },
    receiverUsername: { type: String, required: true, lowercase: true, index: true },
    receiverAvatar: { type: String, default: "" },
    type: { type: String, enum: ["audio", "video"], default: "video" },
    status: {
      type: String,
      enum: ["ringing", "accepted", "declined", "ended", "missed"],
      default: "ringing",
    },
    durationSeconds: { type: Number, default: 0 },
    offer: { type: Schema.Types.Mixed },
    answer: { type: Schema.Types.Mixed },
    callerCandidates: [Schema.Types.Mixed],
    receiverCandidates: [Schema.Types.Mixed],
    lastReaction: { type: Schema.Types.Mixed },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

CallSessionSchema.index({ receiverUsername: 1, status: 1 });
CallSessionSchema.index({ callerUsername: 1, status: 1 });
CallSessionSchema.index({ updatedAt: -1 });

if (mongoose.models?.CallSession) {
  delete (mongoose.models as any).CallSession;
}

export const CallSession: Model<ICallSession> =
  mongoose.models.CallSession ||
  mongoose.model<ICallSession>("CallSession", CallSessionSchema);
