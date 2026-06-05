import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "admin", "member"], default: "member" },
    last_read_message_id: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    is_group: { type: Boolean, default: false },
    title: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [memberSchema],
  },
  { timestamps: true }
);

// Index for quickly finding conversations a user belongs to
conversationSchema.index({ "members.user_id": 1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
