import pool from "../db/postgres.js";
import generatePDF from "../utils/generateCertificate.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("CERTIFICATE CONTROLLER LOADED");


const generateCertificate = async (user_id) => {
  try {
    console.log("Generate Certificate Triggered:", user_id);

    // Fetch latest passed exam for user
    const result = await pool.query(
      `
      SELECT e.id AS exam_id, e.exam_name, e.score
      FROM certificates c
      JOIN exams e ON c.exam_id = e.id
      WHERE c.user_id = $1
      ORDER BY c.issued_at DESC
      LIMIT 1
      `,
      [user_id]
    );

    if (result.rows.length === 0) {
      console.log("No certificate data found for user:", user_id);
      return;
    }

    const { exam_name, score } = result.rows[0];

    // Eligibility check
    if (Number(score) < 50) {
      console.log(`Score ${score} < 50 → Not eligible`);
      return;
    }

    // Generate PDF
    const pdfResult = await generatePDF(exam_name, score, user_id);

    if (pdfResult?.generated) {
      console.log("Certificate PDF Generated:", pdfResult.filePath);
    }

  } catch (err) {
    console.error("generateCertificate Error:", err.message);
  }
};


const generateQuizCertificate = async (req, res) => {
  try {
    const userRes = await pool.query(
      `SELECT user_id, full_name FROM users WHERE firebase_uid = $1`,
      [req.firebase.uid]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const { user_id, full_name } = userRes.rows[0];

    const { exam_name, percentage } = req.body;

    if (!exam_name || percentage === undefined) {
      return res.status(400).json({
        message: "exam_name and percentage are required"
      });
    }

    const score = Number(percentage);

    if (isNaN(score) || score < 50) {
      return res.status(400).json({
        message: "Score below 50%. Certificate not eligible."
      });
    }

    const examRes = await pool.query(
      `SELECT id FROM exams WHERE exam_name = $1`,
      [exam_name]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const exam_id = examRes.rows[0].id;

    /* -------- Prevent duplicate certificates -------- */
    const existingCert = await pool.query(
      `SELECT 1 FROM certificates WHERE user_id = $1 AND exam_id = $2`,
      [user_id, exam_id]
    );

    if (existingCert.rows.length > 0) {
      return res.status(409).json({
        message: "Certificate already issued for this exam"
      });
    }

    /* -------- Generate PDF -------- */
    const pdfResult = await generatePDF(
      exam_name,
      score,
      user_id,
      score,
      full_name
    );

    if (!pdfResult?.generated) {
      return res.status(500).json({
        success: false,
        message: "PDF generation failed"
      });
    }

    const certificateId = path.basename(pdfResult.filePath);

    const insertRes = await pool.query(
      `
      INSERT INTO certificates (user_id, exam_id, certificate_id, issued_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
      `,
      [user_id, exam_id, certificateId]
    );

    return res.status(200).json({
      success: true,
      message: "Certificate generated successfully",
      filePath: pdfResult.filePath,
      certificate: insertRes.rows[0]
    });

  } catch (err) {
    console.error("generateQuizCertificate Error:", err);
    res.status(500).json({
      message: "Internal server error",
      error: err.message
    });
  }
};


export {
  generateCertificate,
  generateQuizCertificate
};
