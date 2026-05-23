import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

import { pool } from "./db.js";
import { socketAuthMiddleware } from "./middleware/authMiddleware.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import audioRoutes from "./routes/audioRoutes.js";

dotenv.config();

/* ─────────────────────────────
   App Setup
───────────────────────────── */

const app = express();
app.set("trust proxy", 1);

const server = createServer(app);
const PORT = process.env.PORT || 5000;

/* ─────────────────────────────
   Allowed Origins
───────────────────────────── */

const ALLOWED_ORIGINS = [
  "https://chatty-phi-ten.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith(".vercel.app")) return true;
  return false;
}

/* ─────────────────────────────
   CORS
───────────────────────────── */

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS:", origin);
      callback(new Error("CORS blocked"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ─────────────────────────────
   Middleware
───────────────────────────── */

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ─────────────────────────────
   Routes
───────────────────────────── */

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/conversations", conversationRoutes);
app.use("/messages", messageRoutes);
app.use("/groups", groupRoutes);
app.use("/api", statsRoutes);
app.use("/audio", audioRoutes);

app.get("/", (_req, res) => res.json({ status: "rChat API running" }));
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

/* ─────────────────────────────
   Socket.IO — optimized for speed
───────────────────────────── */

const io = new Server(server, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
  // Performance tuning
  pingInterval: 25000,     // how often to ping clients
  pingTimeout: 10000,      // how long to wait for pong
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,  // 1MB max message
  // Compression for larger payloads
  perMessageDeflate: {
    threshold: 1024,       // only compress payloads > 1KB
  },
});

/* Socket authentication */
io.use(socketAuthMiddleware);

/* ─────────────────────────────
   Online users — userId → Set<socketId>
───────────────────────────── */

const onlineUsers = new Map();

function addOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function removeOnline(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(userId);
}

function broadcastOnlineUsers() {
  io.emit("online_users", Array.from(onlineUsers.keys()));
}

/* ─────────────────────────────
   Socket Events
───────────────────────────── */

io.on("connection", (socket) => {
  const userId = socket.user.id;

  addOnline(userId, socket.id);
  broadcastOnlineUsers();

  /* — Join/leave conversation rooms — */
  socket.on("join_conversation", (conversationId) => {
    if (conversationId && typeof conversationId === "string") {
      socket.join(conversationId);
    }
  });

  socket.on("leave_conversation", (conversationId) => {
    if (conversationId) socket.leave(conversationId);
  });

  /* — Send message (broadcast to room, not sender) — */
  socket.on("send_message", (data) => {
    if (!data?.conversation_id) return;
    socket.to(data.conversation_id).emit("receive_message", {
      ...data,
      sender_id: userId,
    });
  });

  /* — Delivery / read receipts — */
  socket.on("message_delivered", ({ message_id, conversationId }) => {
    if (!message_id || !conversationId) return;
    io.to(conversationId).emit("message_delivered", { message_id });
  });

  socket.on("message_read", ({ message_id, conversationId }) => {
    if (!message_id || !conversationId) return;
    io.to(conversationId).emit("message_read", { message_id });
  });

  /* — Message delete broadcast — */
  socket.on("delete_message", ({ message_id, conversation_id }) => {
    if (!message_id || !conversation_id) return;
    // Broadcast to everyone in the room (including sender's other tabs)
    io.to(conversation_id).emit("message_deleted", { message_id });
  });

  /* ─── WebRTC Signaling ─── */
  function emitToUser(targetUserId, event, payload) {
    const sockets = onlineUsers.get(String(targetUserId));
    if (!sockets) return;
    sockets.forEach(sid => io.to(sid).emit(event, payload));
  }

  socket.on("webrtc_offer", ({ targetUserId, offer, callType }) => {
    emitToUser(targetUserId, "webrtc_offer", { fromUserId: userId, offer, callType });
  });

  socket.on("webrtc_answer", ({ targetUserId, answer }) => {
    emitToUser(targetUserId, "webrtc_answer", { fromUserId: userId, answer });
  });

  socket.on("webrtc_ice_candidate", ({ targetUserId, candidate }) => {
    emitToUser(targetUserId, "webrtc_ice_candidate", { fromUserId: userId, candidate });
  });

  socket.on("webrtc_reject", ({ targetUserId }) => {
    emitToUser(targetUserId, "webrtc_rejected", { fromUserId: userId });
  });

  socket.on("webrtc_end", ({ targetUserId }) => {
    emitToUser(targetUserId, "webrtc_ended", { fromUserId: userId });
  });



  /* — Typing indicators (debounced on server) — */
  const typingTimers = new Map();

  socket.on("typing", ({ conversationId, isTyping }) => {
    if (!conversationId) return;

    socket.to(conversationId).emit("user_typing", {
      conversationId,
      userId,
      isTyping: Boolean(isTyping),
    });

    // Auto-clear typing if client disconnects without sending isTyping=false
    if (isTyping) {
      if (typingTimers.has(conversationId)) clearTimeout(typingTimers.get(conversationId));
      typingTimers.set(conversationId, setTimeout(() => {
        socket.to(conversationId).emit("user_typing", { conversationId, userId, isTyping: false });
        typingTimers.delete(conversationId);
      }, 5000));
    } else {
      if (typingTimers.has(conversationId)) {
        clearTimeout(typingTimers.get(conversationId));
        typingTimers.delete(conversationId);
      }
    }
  });

  /* — Disconnect — */
  socket.on("disconnect", (reason) => {
    // Clear any pending typing timers
    typingTimers.forEach((timer, cid) => {
      clearTimeout(timer);
      socket.to(cid).emit("user_typing", { conversationId: cid, userId, isTyping: false });
    });
    typingTimers.clear();

    removeOnline(userId, socket.id);
    broadcastOnlineUsers();
  });
});

/* ─────────────────────────────
   Database Check
───────────────────────────── */

async function testDB() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Database connected:", res.rows[0].now);
  } catch (err) {
    console.error("Database connection error:", err.message);
    process.exit(1);
  }
}

/* ─────────────────────────────
   Start
───────────────────────────── */

server.listen(PORT, async () => {
  console.log(`rChat server running on port ${PORT}`);
  await testDB();
});
