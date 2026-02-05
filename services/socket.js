import { Server } from "socket.io";

let io = null;

// Initialize Socket.IO server
export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        process.env.FRONTEND_URL || "http://localhost:5173",
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // When student joins, subscribe to their personal room
    socket.on("join", (userId) => {
      socket.join(userId);
      console.log(`✅ User ${userId} joined their notification room`);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });

    // Optional: handle errors
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

import { sendPushNotification } from "./pushService.js";

// Emit notification to a specific user
export const emitNotificationToUser = (userId, notification) => {
  if (!global.io) {
    console.error("Socket.IO not initialized");
    return;
  }

  global.io.to(`user_${userId}`).emit("new_notification", {
    ...notification,
    timestamp: new Date().toISOString(),
  });

  console.log(`📤 Notification sent to user ${userId}:`, notification.message);
};


// Emit notification to multiple users
export const emitNotificationToUsers = (userIds, notification) => {
  if (!global.io) {
    console.error("Socket.IO not initialized");
    return;
  }

  userIds.forEach((userId) => {
    emitNotificationToUser(userId, notification);
  });
};

// Broadcast notification to all connected users
export const broadcastNotification = (notification) => {
  if (!io) {
    console.error("Socket.IO not initialized");
    return;
  }

  io.emit("notification", {
    ...notification,
    timestamp: new Date().toISOString(),
  });

  console.log(`📢 Broadcast notification:`, notification.message);
};
