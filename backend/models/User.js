import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    display_name: { type: String, trim: true },
  },
  { timestamps: true }
);

userSchema.index({ username: "text" });

export const User = mongoose.model("User", userSchema);
