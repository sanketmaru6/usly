import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICallSession extends Document {
  callerId: mongoose.Types.ObjectId | string;
  callerName: string;
  receiverId: mongoose.Types.ObjectId | string;
  receiverName: string;
  type: "audio" | "video";
  status: "ringing" | "accepted" | "declined" | "ended" | "missed";
  durationSeconds?: number;
  // WebRTC Signaling data exchange (in DB/Memory)
  signalOffer?: string; // JSON string of RTCSessionDescriptionInit
  signalAnswer?: string; // JSON string of RTCSessionDescriptionInit
  iceCandidates?: string[]; // array of JSON stringified RTCIceCandidateInit
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CallSessionSchema = new Schema<ICallSession>(
  {
    callerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    callerName: { type: String, required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverName: { type: String, required: true },
    type: { type: String, enum: ["audio", "video"], default: "video" },
    status: {
      type: String,
      enum: ["ringing", "accepted", "declined", "ended", "missed"],
      default: "ringing",
    },
    durationSeconds: { type: Number, default: 0 },
    signalOffer: { type: String },
    signalAnswer: { type: String },
    iceCandidates: [{ type: String }],
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

CallSessionSchema.index({ receiverId: 1, status: 1 });
CallSessionSchema.index({ callerId: 1, status: 1 });

export const CallSession: Model<ICallSession> =
  mongoose.models.CallSession || mongoose.model<ICallSession>("CallSession", CallSessionSchema);
