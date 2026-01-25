import admin from "../services/firebaseAdmin.js";
import pool from "../db/postgres.js";
import { sendInstructorInvite } from "../services/email.service.js";

export const getMyProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        user_id AS id,
        full_name AS "displayName",
        email,
        role,
        status,
        bio,
        headline,
        linkedin,
        github,
        photo_url AS "photoURL",
        created_at
      FROM users
      WHERE user_id = $1
      `,
      [req.user.id],
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("getMyProfile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, full_name, email, role, status, created_at
       FROM users
       ORDER BY created_at DESC`,
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const addInstructor = async (req, res) => {
  const { fullName, email, subject, phone, bio } = req.body;

  try {
    const firebaseUser = await admin.auth().createUser({
      email,
      displayName: fullName,
    });

    const userResult = await pool.query(
      `INSERT INTO users (firebase_uid, full_name, email, role, status)
       VALUES ($1, $2, $3, 'instructor', 'active')
       RETURNING user_id`,
      [firebaseUser.uid, fullName, email],
    );

    const instructorId = userResult.rows[0].user_id;

    await pool.query(
      `INSERT INTO instructor_profiles (instructor_id, subject, phone, bio)
       VALUES ($1, $2, $3, $4)`,
      [instructorId, subject, phone, bio],
    );

    await sendInstructorInvite({
      email,
      name: fullName,
    });

    res.status(201).json({
      message: "Instructor created successfully",
    });
  } catch (error) {
    console.error("addInstructor error:", error);
    res.status(400).json({ message: error.message });
  }
};

export const updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET status = $1
       WHERE user_id = $2
       RETURNING user_id, status`,
      [status, userId],
    );

    res.status(200).json({
      message: "User status updated",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateMyProfile = async (req, res) => {
  const { displayName, bio, headline, linkedin, github, photoURL } = req.body;

  try {
    await pool.query(
      `
      UPDATE users SET
        full_name = $1,
        bio = $2,
        headline = $3,
        linkedin = $4,
        github = $5,
        photo_url = $6,
        updated_at = NOW()
      WHERE user_id = $7
      `,
      [displayName, bio, headline, linkedin, github, photoURL, req.user.id],
    );

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("updateMyProfile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
