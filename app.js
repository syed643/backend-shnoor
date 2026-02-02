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
import practiceRoutes from "./routes/practice.routes.js";
import { verifyChatSchema } from "./controllers/chat.controller.js";
import http from "http";
import { Server } from "socket.io";

const app = express();
app.set("trust proxy", 1);


const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
];

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
  })
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api", moduleRoutes);
app.use("/api/assignments", assignmentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentCoursesRoutes)
app.use("/api/exams", examRoutes);
app.use("/api/student/exams", studentExamRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/practice",practiceRoutes);      




app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
  upgradeTimeout: 10000,
  allowEIO3: false,
});

io.on("connection", (socket) => {
  console.log("socket connected successfully", socket.id);

  socket.on("join_user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  });

  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined chat_${chatId}`);
  });

  socket.on("send_message", async (data) => {
    const {
      chatId,
      text,
      senderId,
      recipientId,
      attachment_file_id,
      attachment_name,
      attachment_type,
    } = data;

    try {
      const query = `
            INSERT INTO messages (chat_id, sender_id, receiver_id, text, attachment_file_id, attachment_type, attachment_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
      const values = [
        chatId,
        senderId,
        recipientId,
        text,
        attachment_file_id,
        attachment_type,
        attachment_name,
      ];
      const result = await pool.query(query, values);
      const savedMessage = result.rows[0];

      // Emit to chat room
      io.to(`chat_${chatId}`).emit("receive_message", {
        ...savedMessage,
        sender_id: senderId,
      });

      // Notification
      const notifPayload = {
        chat_id: chatId,
        sender_name: data.senderName,
        text: text || (attachment_name ? "Sent a file" : "New Message"),
        sender_id: senderId,
      };

      io.to(`user_${recipientId}`).emit("new_notification", notifPayload);
    } catch (err) {
      console.error("Socket Message Error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Test database connection before starting server
pool.query("SELECT NOW()")
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Fix any missing chat columns
    await verifyChatSchema();

    server.listen(PORT, HOST, () => {
      console.log(`✅ Server running on ${HOST}:${PORT}`);
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