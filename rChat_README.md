# rChat (Cyphr) — Secure Real-Time Chat Application

A full-stack, real-time messaging platform built with the **MERN** stack (MongoDB, Express, React, Node.js), featuring end-to-end encrypted messages, OTP-based phone authentication, WebRTC audio/video calling, and group chat management.

---

## Features

### Authentication

- **Phone-number OTP login** via Firebase Authentication (no passwords stored).
- Backend verifies the Firebase ID token server-side and issues its own **JWT** (7-day expiry), decoupling app session management from Firebase.
- JWT-protected REST routes and a parallel **Socket.IO authentication middleware**, so real-time connections are equally secured.

### Messaging

- **End-to-end encrypted messages** — content is encrypted client-side; the server stores ciphertext + IV only (`Message.content`, `Message.iv`), never plaintext.
- Real-time delivery via **Socket.IO** with conversation-scoped rooms (`join_conversation` / `leave_conversation`).
- **Message status tracking**: sent → delivered → read, broadcast through dedicated socket events.
- **Typing indicators** with automatic 5-second timeout reset.
- **Message deletion** (soft delete with `deleted` / `deleted_at` flags) synced live to all participants.
- **Encrypted voice notes** uploaded as encrypted blobs via `/audio/upload`.

### Voice & Video Calling

- **WebRTC peer-to-peer calls** (audio and video) with signaling over Socket.IO (`webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`, `webrtc_reject`, `webrtc_end`).
- **Call logs** persisted to MongoDB (`CallLog` model) capturing type, status (completed/missed/declined), and duration.
- Picture-in-picture call layout and bitrate-tuned media constraints for better quality on constrained networks.

### Groups & Contacts

- One-to-one and **group conversations** with role-based membership (`owner`, `admin`, `member`).
- Add/remove members and promote to admin via dedicated group routes.
- **Online presence** tracking — the server maintains a `userId → Set<socketId>` map and broadcasts `online_users` on connect/disconnect.
- Username search to discover and start conversations with other users.

### Other

- **Cloudinary** integration for media uploads (via `multer-storage-cloudinary`).
- Public `/api/stats` endpoint exposing aggregate usage metrics (users, messages, conversations, groups).
- **PWA-ready** frontend (manifest, icons, install prompts via `vite-plugin-pwa`).

---

## Tech Stack

| Layer      | Technology                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Frontend   | React 18, Vite, Socket.IO client, Firebase Auth SDK, `react-phone-input-2`, `emoji-picker-react` |
| Backend    | Node.js, Express 5, Socket.IO, Mongoose (MongoDB)                                                |
| Auth       | Firebase Authentication (OTP) + custom JWT                                                       |
| Real-time  | Socket.IO (WebSockets with polling fallback)                                                     |
| Media      | Cloudinary, Multer                                                                               |
| Deployment | Vercel (frontend & backend)                                                                      |

---

## Architecture

```
frontend/   React SPA (Vite, PWA)
backend/
  server.js              Express + Socket.IO bootstrap, online-user map, WebRTC signaling
  db.js                  MongoDB connection (Mongoose)
  models/                User, Message, Conversation, CallLog
  controllers/           Business logic per resource
  routes/                REST endpoints
  middleware/
    authMiddleware.js    REST JWT guard + Socket.IO auth middleware
  services/
    firebaseAdmin.js     Firebase ID token verification
    otpService.js
```

### Data Models

- **User**: `phone` (unique), `username` (unique, sparse), `display_name`
- **Conversation**: `is_group`, `title`, `created_by`, `members[]` (each with `user_id`, `role`, `last_read_message_id`)
- **Message**: `conversation_id`, `sender_id`, `content` (encrypted), `iv`, `status`, soft-delete flags
- **CallLog**: `conversation_id`, `initiator_id`, `call_type`, `status`, `duration_seconds`

---

## API Overview

| Method              | Endpoint                         | Description                            |
| ------------------- | -------------------------------- | -------------------------------------- |
| POST                | `/auth/verify-firebase`          | Exchange Firebase ID token for app JWT |
| GET                 | `/auth/me`                       | Get current authenticated user         |
| POST                | `/users/username`                | Set username                           |
| GET                 | `/users/search`                  | Search users by username               |
| POST                | `/conversations`                 | Create a 1:1 or group conversation     |
| GET                 | `/conversations`                 | List user's conversations              |
| POST                | `/messages`                      | Send a message                         |
| GET                 | `/messages/:conversationId`      | Fetch conversation messages            |
| POST                | `/messages/status`               | Update delivery/read status            |
| POST                | `/messages/:conversationId/read` | Mark conversation read                 |
| DELETE              | `/messages/:messageId`           | Delete a message                       |
| POST                | `/groups`                        | Create a group                         |
| GET / POST / DELETE | `/groups/:id/members`            | Manage group membership                |
| POST                | `/groups/:id/promote`            | Promote member to admin                |
| POST                | `/audio/upload`                  | Upload encrypted voice note            |
| POST / GET          | `/calls`                         | Save / fetch call logs                 |
| GET                 | `/api/stats`                     | Public usage stats                     |

### Key Socket.IO Events

`join_conversation`, `leave_conversation`, `send_message`, `receive_message`, `typing` / `user_typing`, `message_delivered`, `message_read`, `delete_message`, `online_users`, `webrtc_offer/answer/ice_candidate/reject/end/call_record`

---

## Setup

### Backend

```bash
cd backend
npm install
# .env requires: MONGO_URI, JWT_SECRET, Firebase service account credentials, CLOUDINARY_*
npm run dev
```

### Frontend

```bash
cd frontend
npm install
# .env from .env.example (Firebase web config, API base URL)
npm run dev
```

---

## License

MIT
