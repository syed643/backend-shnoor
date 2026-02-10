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

const issueExamCertificate = async ({ userId, examId, score }) => {
  if (!userId || !examId || score === undefined) {
    return { issued: false, reason: "invalid_input" };
  }

  const examRes = await pool.query(
    `SELECT exam_id, title, pass_percentage FROM exams WHERE exam_id = $1`,
    [examId]
  );

  if (examRes.rows.length === 0) {
    return { issued: false, reason: "exam_not_found" };
  }

  const exam = examRes.rows[0];
  const passPercentage = Number(exam.pass_percentage);
  const numericScore = Number(score);

  if (Number.isNaN(numericScore)) {
    return { issued: false, reason: "invalid_score" };
  }

  const codingCheck = await pool.query(
    `
    SELECT 1
    FROM exam_questions
    WHERE exam_id = $1 AND question_type = 'coding'
    LIMIT 1
    `,
    [examId]
  );

  if (codingCheck.rows.length > 0) {
    return { issued: false, reason: "coding_present" };
  }

  if (numericScore < passPercentage) {
    return { issued: false, reason: "not_passed" };
  }

  const existingCert = await pool.query(
    `SELECT 1 FROM certificates WHERE user_id = $1 AND exam_id = $2`,
    [userId, examId]
  );

  if (existingCert.rows.length > 0) {
    return { issued: false, reason: "already_issued" };
  }

  const userRes = await pool.query(
    `SELECT full_name FROM users WHERE user_id = $1`,
    [userId]
  );

  const studentName = userRes.rows[0]?.full_name || null;

  const pdfResult = await generatePDF(
    exam.title,
    numericScore,
    userId,
    numericScore,
    studentName
  );

  if (!pdfResult?.generated) {
    return { issued: false, reason: "pdf_failed" };
  }

  const certificateId = pdfResult.filePath
    ? path.basename(pdfResult.filePath)
    : null;

  const insertRes = await pool.query(
    `
    INSERT INTO certificates
      (user_id, exam_id, exam_name, score, certificate_id, issued_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING *
    `,
    [userId, examId, exam.title, numericScore, certificateId]
  );

  return {
    issued: true,
    certificate: insertRes.rows[0],
    filePath: pdfResult.filePath || null
  };
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

    if (isNaN(score)) {
      return res.status(400).json({
        message: "Invalid score"
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
        success: false,
        message: messageMap[reason] || "Certificate not eligible"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Certificate generated successfully",
      filePath: certificateResult.filePath,
      certificate: certificateResult.certificate
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
  issueExamCertificate,
  generateQuizCertificate
};
