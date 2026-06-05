import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    initiator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    call_type: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "missed", "declined"],
      required: true,
    },
    duration_seconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callLogSchema.index({ conversation_id: 1, createdAt: -1 });

export const CallLog = mongoose.model("CallLog", callLogSchema);
