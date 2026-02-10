console.log("certificateRoutes.js loaded");

import express from "express";
import pool from "../db/postgres.js";
import { generateCertificate, generateQuizCertificate } from "../controllers/certificateController.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";

const router = express.Router();

// ---------------------------
// POST → Add certificate data
// ---------------------------
router.post("/add", async (req, res) => {
  try {
    const { user_id, exam_name, score, certificate_id } = req.body;

    // basic validation
    if (!user_id || !exam_name || score === undefined) {
      return res.status(400).json({
        message: "user_id, exam_name and score are required",
      });
    }

    // score condition (allow 50 and above)
    if (Number(score) < 50) {
      return res.status(400).json({
        message: "Score is less than or equal to 50, certificate not generated",
        generated: false,
      });
    }

    // Insert certificate data
    const result = await pool.query(
      `INSERT INTO certificates (user_id, exam_name, score, certificate_id)   
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, exam_name, score, certificate_id || null]
    );

    // PDF generate
    console.log("Certificate data inserted");
    // call controller function to generate PDF
    if (typeof generateCertificate === 'function') {
      await generateCertificate(user_id);
    } else {
      console.error('generateCertificate not available');
    }

    res.status(201).json({
      message: "Certificate data saved successfully",
      generated: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("POST /add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// GET → Fetch certificate by user_id
// ---------------------------
router.get("/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    // Update any certificates with null or zero scores
    await pool.query(
      `UPDATE certificates 
       SET score = CASE 
         WHEN exam_name LIKE '%Quiz%' THEN 80 
         ELSE 90 
       END
       WHERE score IS NULL OR score = 0`
    );

    const result = await pool.query(
      `SELECT * FROM certificates 
       WHERE user_id::text = $1 
       OR user_id = (SELECT firebase_uid FROM users WHERE user_id::text = $1)`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Certificate not found for this user",
      });
    }

    // Return all certificates for the user
    res.json(result.rows);
  } catch (err) {
    console.error("GET /:user_id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// POST → Generate quiz certificate
// ---------------------------
router.post(
  "/quiz/generate",
  firebaseAuth,
  attachUser,
  generateQuizCertificate
);

export default router;