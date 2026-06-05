import express from "express";
import { User } from "../models/User.js";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";

const router = express.Router();

router.get("/stats", async (req, res) => {
  try {
    const [users, messages, conversations, groups] = await Promise.allSettled([
      User.countDocuments(),
      Message.countDocuments(),
      Conversation.countDocuments(),
      Conversation.countDocuments({ is_group: true }),
    ]);

    res.json({
      users: users.status === "fulfilled" ? users.value : 0,
      messages: messages.status === "fulfilled" ? messages.value : 0,
      conversations: conversations.status === "fulfilled" ? conversations.value : 0,
      groups: groups.status === "fulfilled" ? groups.value : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
