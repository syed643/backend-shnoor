console.log("certificateRoutes.js loaded");

import express from "express";
import pool from "../db/postgres.js";
import {
  generateQuizCertificate,
  issueExamCertificate
} from "../controllers/certificate.controller.js";
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

    const examRes = await pool.query(
      `SELECT exam_id FROM exams WHERE title = $1`,
      [exam_name]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const exam_id = examRes.rows[0].exam_id;

    const certificateResult = await issueExamCertificate({
      userId: user_id,
      examId: exam_id,
      score
    });

    if (!certificateResult.issued) {
      const reason = certificateResult.reason || "not_eligible";
      const messageMap = {
        coding_present: "Coding questions are not eligible for certificates yet",
        not_passed: "Score below pass percentage. Certificate not eligible.",
        already_issued: "Certificate already issued for this exam",
        pdf_failed: "PDF generation failed"
      };

      return res.status(400).json({
        generated: false,
        message: messageMap[reason] || "Certificate not eligible"
      });
    }

    if (certificate_id) {
      await pool.query(
        `
        UPDATE certificates
        SET certificate_id = $1
        WHERE user_id = $2 AND exam_id = $3
        `,
        [certificate_id, user_id, exam_id]
      );
    }

    res.status(201).json({
      message: "Certificate generated successfully",
      generated: true,
      data: certificateResult.certificate,
      filePath: certificateResult.filePath
    });
  } catch (err) {
    console.error("POST /add error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------
// GET → Fetch my certificates (authenticated user) - MUST come before /:user_id
// ---------------------------
router.get(
  "/my",
  firebaseAuth,
  attachUser,
  async (req, res) => {
    try {
      const userId = req.user.id;

      if (!userId) {
        return res.status(401).json({
          message: "Unauthorized: user ID not found"
        });
      }

      const result = await pool.query(
        `SELECT * FROM certificates 
         WHERE user_id = $1
         ORDER BY issued_at DESC`,
        [userId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("GET /my error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

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
       OR user_id::text = (SELECT firebase_uid FROM users WHERE user_id::text = $1 OR firebase_uid = $1)`,
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