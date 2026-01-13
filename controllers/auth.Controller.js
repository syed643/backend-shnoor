import admin from "../services/firebaseAdmin.js";
import pool from "../db/postgres.js";

/* =========================
   REGISTER CONTROLLER
========================= */
export const register = async (req, res) => {
  try {
    const { token, fullName, role } = req.body;

    if (!token || !fullName || !role) {
      return res.status(400).json({
        message: "Firebase token, full name, and role are required",
      });
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);

    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    // Check if user already exists
    const existingUser = await pool.query(
      `SELECT user_id FROM users WHERE firebase_uid = $1`,
      [firebaseUid]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "User already registered. Please login.",
      });
    }

    // 🚨 IMPORTANT: Force status to pending
    const status = "pending";

    // Create user in PostgreSQL
    const newUser = await pool.query(
      `INSERT INTO users
       (firebase_uid, full_name, email, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, full_name, email, role, status`,
      [firebaseUid, fullName, email, role, status]
    );

    res.status(201).json({
      message:
        "Registration successful. Your account is pending admin approval.",
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error("authController register error:", error);
    res.status(401).json({
      message: "Invalid or expired Firebase token",
    });
  }
};

/* =========================
   LOGIN CONTROLLER
========================= */
export const login = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Firebase ID token is required",
      });
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const firebaseUid = decodedToken.uid;

    // Fetch user from DB
    const result = await pool.query(
      `SELECT user_id, role, status
       FROM users
       WHERE firebase_uid = $1`,
      [firebaseUid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not registered. Please register first.",
      });
    }

    const user = result.rows[0];

    // 🚫 Block pending users
    if (user.status === "pending") {
      return res.status(403).json({
        message: "Your account is pending admin approval",
      });
    }

    // 🚫 Block inactive / blocked users (future-proof)
    if (user.status !== "active") {
      return res.status(403).json({
        message: "Your account is blocked. Contact admin.",
      });
    }

    // ✅ Login allowed
    res.status(200).json({
      message: "Login successful",
      user,
    });
  } catch (error) {
    console.error("authController login error:", error);
    res.status(401).json({
      message: "Invalid or expired Firebase token",
    });
  }
};

/* =========================
   LOGOUT CONTROLLER
========================= */
export const logout = async (req, res) => {
  // Firebase logout is handled on frontend
  res.status(200).json({
    message: "Logout successful",
  });
};
