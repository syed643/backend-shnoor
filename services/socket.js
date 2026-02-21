import { Server } from "socket.io";
import admin from "firebase-admin";
import { autoSubmitExam } from "../controllers/exams/exam.controller.js";
import pool from "../db/postgres.js";
import { sendPushNotification } from "./pushService.js";

const activeExamSessions = new Map();
// key = userId_examId
// value = { timeoutId }

let io = null;

// Initialize Socket.IO server
export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    // Faster disconnect detection to trigger grace timer promptly
    pingInterval: 5000,
    pingTimeout: 8000,
    cors: {
      origin: [
        "http://localhost:5173",
        process.env.FRONTEND_URL || "http://localhost:5173",
      ],
      credentials: true,
    },
  });

  /* =====================================
     🔐 SOCKET AUTH MIDDLEWARE
     Verify Firebase Token
  ===================================== */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication token missing"));
      }

      const decoded = await admin.auth().verifyIdToken(token);

      // Get actual DB user_id (UUID)
      const { rows } = await pool.query(
        `SELECT user_id FROM users WHERE firebase_uid = $1`,
        [decoded.uid]
      );

      if (!rows.length) {
        return next(new Error("User not found in database"));
      }

      socket.userId = rows[0].user_id; // Real UUID from DB
      next();
    } catch (err) {
      console.error("Socket authentication error:", err);
      next(new Error("Authentication failed"));
    }
  });

  /* =====================================
     🔌 SOCKET CONNECTION
  ===================================== */
  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);
    console.log(`👤 Authenticated user: ${socket.userId}`);

    /* =========================
       JOIN USER ROOM
    ========================= */
    socket.join(socket.userId);

    /* =========================
       STUDENT STARTS EXAM
    ========================= */
    socket.on("exam:start", ({ examId }) => {
      const userId = socket.userId;
      const key = `${userId}_${examId}`;

      socket.examId = examId;

      console.log(`📝 User ${userId} started exam ${examId}`);
      console.log(`🔍 Active sessions before reconnect check:`, activeExamSessions.has(key));

      // Cancel existing timer if reconnecting
      if (activeExamSessions.has(key)) {
        clearTimeout(activeExamSessions.get(key).timeoutId);
        activeExamSessions.delete(key);
        console.log(`✅ Reconnected in time! Timer cancelled for user ${userId}, exam ${examId}`);
        console.log(`⏰ Timer was cancelled - exam will continue normally`);
      } else {
        console.log(`🆕 Fresh exam start (no previous disconnect timer)`);
      }
    });

    /* =========================
       HANDLE DISCONNECT
    ========================= */
    socket.on("disconnect", async () => {
      console.log(`❌ User disconnected: ${socket.id}`);

      const userId = socket.userId;
      const examId = socket.examId;

      if (!userId || !examId) {
        console.log(`⚠️ Disconnect ignored - no userId or examId (userId: ${userId}, examId: ${examId})`);
        return;
      }

      const key = `${userId}_${examId}`;

      try {
        // Fetch grace time
        const { rows } = await pool.query(
          `SELECT disconnect_grace_time FROM exams WHERE exam_id = $1`,
          [examId]
        );

        if (!rows.length) {
          console.error(`❌ Exam ${examId} not found in database`);
          return;
        }

        const graceTime = rows[0]?.disconnect_grace_time || 120;

        console.log(`⏳ Starting ${graceTime}s grace timer for ${userId} on exam ${examId}`);
        console.log(`⏰ Timer will expire at: ${new Date(Date.now() + graceTime * 1000).toLocaleTimeString()}`);

        const timeoutId = setTimeout(async () => {
          console.log(`🚨 Grace time expired for ${userId} on exam ${examId} → Auto submitting`);

          await autoSubmitExam(userId, examId);
          activeExamSessions.delete(key);

          if (io) {
            io.to(userId).emit("exam:autoSubmitted", {
              examId,
              message: "Exam auto-submitted due to disconnection",
            });
            console.log(`📤 Sent exam:autoSubmitted event to user ${userId}`);
          }

        }, graceTime * 1000);

        activeExamSessions.set(key, { timeoutId });
        console.log(`📝 Stored timeout for key: ${key}`);

      } catch (err) {
        console.error("Disconnect handling error:", err);
      }
    });

    socket.on("error", (err) => {
      console.error(`Socket error for ${socket.id}:`, err);
    });
  });

  console.log("✅ Socket.IO initialized");
  return io;
};

// Get Socket.IO instance
export const getIO = () => {
  if (!io) {
    console.warn("⚠️ Socket.IO not initialized yet");
  }
  return io;
};

// Emit notification to a specific user
export const emitNotificationToUser = (userId, notification) => {
  if (!io) {
    console.error("Socket.IO not initialized");
    return;
  }

  io.to(userId).emit("new_notification", {
    ...notification,
    timestamp: new Date().toISOString(),
  });

  console.log(`📤 Notification sent to user ${userId}`);
};

// Emit notification to multiple users
export const emitNotificationToUsers = (userIds, notification) => {
  if (!io) return;

  userIds.forEach((userId) => {
    emitNotificationToUser(userId, notification);
  });
};

// Broadcast notification
export const broadcastNotification = (notification) => {
  if (!io) return;

  io.emit("notification", {
    ...notification,
    timestamp: new Date().toISOString(),
  });

  console.log("📢 Broadcast notification");
};
