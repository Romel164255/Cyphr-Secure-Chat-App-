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

app.get("/", (_req, res) => {
  res.json({
    status: "rChat API running"
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

/* ─────────────────────────────
   Socket.IO
───────────────────────────── */

const io = new Server(server, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 10000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: {
    threshold: 1024,
  },
});

io.use(socketAuthMiddleware);

/* ─────────────────────────────
   Online Users
───────────────────────────── */

const onlineUsers = new Map();

function addOnline(userId, socketId) {
  userId = String(userId);

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }

  onlineUsers.get(userId).add(socketId);
}

function removeOnline(userId, socketId) {
  userId = String(userId);

  const sockets = onlineUsers.get(userId);

  if (!sockets) return;

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);
  }
}

function broadcastOnlineUsers() {
  io.emit(
    "online_users",
    Array.from(onlineUsers.keys())
  );
}

/* ─────────────────────────────
   Socket Events
───────────────────────────── */

io.on("connection", (socket) => {

  const userId = String(socket.user.id);

  console.log(
    `User connected: ${userId}`
  );

  addOnline(userId, socket.id);
  broadcastOnlineUsers();

  const typingTimers = new Map();

  /* Conversation */

  socket.on(
    "join_conversation",
    (conversationId) => {
      if (
        conversationId &&
        typeof conversationId === "string"
      ) {
        socket.join(conversationId);
      }
    }
  );

  socket.on(
    "leave_conversation",
    (conversationId) => {
      if (conversationId) {
        socket.leave(conversationId);
      }
    }
  );

  /* Messaging */

  socket.on(
    "send_message",
    (data) => {
      if (!data?.conversation_id) return;

      socket.to(
        data.conversation_id
      ).emit(
        "receive_message",
        {
          ...data,
          sender_id: userId,
        }
      );
    }
  );

  socket.on(
    "message_delivered",
    ({ message_id, conversationId }) => {

      if (
        !message_id ||
        !conversationId
      ) return;

      io.to(
        conversationId
      ).emit(
        "message_delivered",
        { message_id }
      );
    }
  );

  socket.on(
    "message_read",
    ({ message_id, conversationId }) => {

      if (
        !message_id ||
        !conversationId
      ) return;

      io.to(
        conversationId
      ).emit(
        "message_read",
        { message_id }
      );
    }
  );

  socket.on(
    "delete_message",
    ({ message_id, conversation_id }) => {

      if (
        !message_id ||
        !conversation_id
      ) return;

      io.to(
        conversation_id
      ).emit(
        "message_deleted",
        { message_id }
      );
    }
  );

  /* Typing */

  socket.on(
    "typing",
    ({
      conversationId,
      isTyping
    }) => {

      if (!conversationId) return;

      socket.to(
        conversationId
      ).emit(
        "user_typing",
        {
          conversationId,
          userId,
          isTyping:
            Boolean(isTyping)
        }
      );

      if (isTyping) {

        if (
          typingTimers.has(
            conversationId
          )
        ) {
          clearTimeout(
            typingTimers.get(
              conversationId
            )
          );
        }

        typingTimers.set(
          conversationId,
          setTimeout(() => {

            socket.to(
              conversationId
            ).emit(
              "user_typing",
              {
                conversationId,
                userId,
                isTyping:false
              }
            );

            typingTimers.delete(
              conversationId
            );

          },5000)
        );
      }
    }
  );

  /* ─────────────────────────────
     WebRTC Signaling
  ───────────────────────────── */

  socket.on(
    "webrtc_offer",
    ({
      targetUserId,
      offer,
      callType
    }) => {

      const targetSockets =
        onlineUsers.get(
          String(targetUserId)
        );

      if (!targetSockets) return;

      targetSockets.forEach(
        (sid)=>{
          io.to(sid).emit(
            "webrtc_offer",
            {
              fromUserId:userId,
              offer,
              callType
            }
          );
        }
      );

    }
  );

  socket.on(
    "webrtc_answer",
    ({
      targetUserId,
      answer
    }) => {

      const targetSockets =
        onlineUsers.get(
          String(targetUserId)
        );

      if (!targetSockets) return;

      targetSockets.forEach(
        sid=>{
          io.to(sid).emit(
            "webrtc_answer",
            {
              fromUserId:userId,
              answer
            }
          );
        }
      );

    }
  );

  socket.on(
    "webrtc_ice_candidate",
    ({
      targetUserId,
      candidate
    }) => {

      const targetSockets =
        onlineUsers.get(
          String(targetUserId)
        );

      if (!targetSockets) return;

      targetSockets.forEach(
        sid=>{
          io.to(sid).emit(
            "webrtc_ice_candidate",
            {
              fromUserId:userId,
              candidate
            }
          );
        }
      );

    }
  );

  socket.on(
    "webrtc_reject",
    ({targetUserId})=>{

      const targetSockets=
        onlineUsers.get(
          String(targetUserId)
        );

      if(!targetSockets)return;

      targetSockets.forEach(
        sid=>{
          io.to(sid).emit(
            "webrtc_rejected",
            {
              fromUserId:userId
            }
          );
        }
      );

    }
  );

  socket.on(
    "webrtc_end",
    ({targetUserId})=>{

      const targetSockets=
        onlineUsers.get(
          String(targetUserId)
        );

      if(!targetSockets)return;

      targetSockets.forEach(
        sid=>{
          io.to(sid).emit(
            "webrtc_ended",
            {
              fromUserId:userId
            }
          );
        }
      );

    }
  );

  /* Disconnect */

  socket.on(
    "disconnect",
    ()=>{

      typingTimers.forEach(
        (timer,cid)=>{
          clearTimeout(timer);

          socket.to(cid)
          .emit(
            "user_typing",
            {
              conversationId:cid,
              userId,
              isTyping:false
            }
          );
        }
      );

      typingTimers.clear();

      removeOnline(
        userId,
        socket.id
      );

      broadcastOnlineUsers();

      console.log(
        `Disconnected: ${userId}`
      );

    }
  );

});

/* Database */

async function testDB() {
  try {
    const res =
      await pool.query(
        "SELECT NOW()"
      );

    console.log(
      "Database connected:",
      res.rows[0].now
    );

  } catch (err) {

    console.error(
      "Database error:",
      err.message
    );

    process.exit(1);
  }
}

/* Start Server */

server.listen(
  PORT,
  async()=>{

    console.log(
      `rChat server running on ${PORT}`
    );

    await testDB();

  }
);