import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "./db/postgres.js";

import authRoutes from "./routes/auth.routes.js";
import usersRoutes from "./routes/users.routes.js";
import coursesRoutes from "./routes/courses.routes.js";
import moduleRoutes from "./routes/module.routes.js";
import assignmentsRoutes from "./routes/assignments.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import studentCoursesRoutes from "./routes/studentCourses.routes.js";
import examRoutes from "./routes/exam.routes.js";
import studentExamRoutes from "./routes/studentExam.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import groupsRoutes from "./routes/group.routes.js";
import practiceRoutes from "./routes/practice.routes.js";
import http from "http";
import { Server } from "socket.io";
import { initChatTables, serveFile } from "./controllers/chat.controller.js";

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const baseUrl = process.env.BACKEND_URL;
const allowedOrigins = ["http://localhost:5173", process.env.FRONTEND_URL];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api", moduleRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/groups", groupsRoutes);
app.use("/api/student", studentCoursesRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/student/exams", studentExamRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/practice", practiceRoutes);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

app.get("/api/media/:id", serveFile);

const userSockets = new Map(); // Map<userId, socketId>

io.on("connection", (socket) => {
  console.log(`Socket Connected: ${socket.id}`);

  socket.on("join_user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  });

  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined chat_${chatId}`);
  });

  socket.on("send_message", async (data) => {
    console.log("📨 send_message event received:", data);

    const {
      chatId,
      text,
      senderId,
      senderUid,
      senderName,
      recipientId,
      attachment_file_id,
      attachment_type,
      attachment_name,
    } = data;

    console.log("📨 Parsed data:", { chatId, senderId, recipientId, text });

    try {
      console.log("📨 Attempting to insert message into database...");
      const result = await pool.query(
        `INSERT INTO messages (
                chat_id, sender_id, receiver_id, text, 
                attachment_file_id, attachment_type, attachment_name
            ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
        [
          chatId,
          senderId,
          recipientId,
          text || "",
          attachment_file_id || null,
          attachment_type || null,
          attachment_name || null,
        ],
      );
      const savedMsg = result.rows[0];
      console.log("✅ Message saved to database:", savedMsg);

      // Construct Payload with File URL if needed
      const payload = {
        ...savedMsg,
        sender_uid: senderUid,
        sender_name: senderName,
        attachment_url: savedMsg.attachment_file_id
          ? `${baseUrl}/api/chats/media/${msg.attachment_file_id}`
          : null,
      };

      console.log(
        "📨 Broadcasting receive_message to chat_" +
          chatId +
          " (excluding sender)",
      );
      // Broadcast to Chat Room (EXCLUDING SENDER to avoid duplicates)
      // Sender already has optimistic UI update
      socket.broadcast.to(`chat_${chatId}`).emit("receive_message", payload);

      console.log("📨 Emitting new_notification to user_" + recipientId);
      // Emit Notification to Recipient's User Room
      io.to(`user_${recipientId}`).emit("new_notification", {
        chat_id: chatId,
        sender_id: senderId,
        sender_name: senderName,
        text: text || "Sent an attachment",
        created_at: savedMsg.created_at,
      });

      // Update Updated_At
      await pool.query(
        "UPDATE chats SET updated_at = NOW() WHERE chat_id = $1",
        [chatId],
      );
      console.log("✅ Message handling complete");
    } catch (err) {
      console.error("❌ Socket Message Error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket Disconnected");
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

// Test database connection before starting server
pool
  .query("SELECT NOW()")
  .then(async () => {
    console.log("✅ Database connected successfully");
    await initChatTables(); // Init Chat Tables
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    console.error("Please check your database credentials in .env");
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit - just log the error
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  // Don't exit - just log the error
});
