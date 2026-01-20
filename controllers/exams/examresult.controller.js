import pool from "../../db/postgres.js";

/**
 * ===============================
 * STUDENT: Get my exam results
 * ===============================
 * Shows score, pass/fail, evaluated status
 */
export const getMyExamResults = async (req, res) => {
  try {
    const studentId = req.user.user_id;

    const { rows } = await pool.query(
      `
      SELECT
        es.exam_submission_id,
        e.exam_id,
        e.title AS exam_title,
        e.duration,
        e.pass_percentage,
        es.total_marks,
        es.scored_marks,
        es.percentage,
        es.is_passed,
        es.evaluated_at,
        es.created_at
      FROM exam_submissions es
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE es.student_id = $1
      ORDER BY es.created_at DESC
      `,
      [studentId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error("getMyExamResults error:", err);
    res.status(500).json({ message: "Failed to fetch exam results" });
  }
};

/**
 * ======================================
 * STUDENT: Get result for single exam
 * ======================================
 */
export const getMyExamResultByExam = async (req, res) => {
  try {
    const studentId = req.user.user_id;
    const { examId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        es.exam_submission_id,
        e.exam_id,
        e.title AS exam_title,
        e.pass_percentage,
        es.total_marks,
        es.scored_marks,
        es.percentage,
        es.is_passed,
        es.evaluated_at,
        es.created_at
      FROM exam_submissions es
      JOIN exams e ON e.exam_id = es.exam_id
      WHERE es.student_id = $1
        AND es.exam_id = $2
      LIMIT 1
      `,
      [studentId, examId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Result not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("getMyExamResultByExam error:", err);
    res.status(500).json({ message: "Failed to fetch exam result" });
  }
};

/**
 * ======================================
 * INSTRUCTOR: Get results for an exam
 * ======================================
 */
export const getExamResultsForInstructor = async (req, res) => {
  try {
    const instructorId = req.user.user_id;
    const { examId } = req.params;

    // 🔐 Ensure exam belongs to instructor
    const examCheck = await pool.query(
      `
      SELECT exam_id
      FROM exams
      WHERE exam_id = $1 AND instructor_id = $2
      `,
      [examId, instructorId]
    );

    if (examCheck.rows.length === 0) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        es.exam_submission_id,
        u.user_id AS student_id,
        u.full_name AS student_name,
        u.email,
        es.total_marks,
        es.scored_marks,
        es.percentage,
        es.is_passed,
        es.evaluated_at,
        es.created_at
      FROM exam_submissions es
      JOIN users u ON u.user_id = es.student_id
      WHERE es.exam_id = $1
      ORDER BY es.created_at DESC
      `,
      [examId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error("getExamResultsForInstructor error:", err);
    res.status(500).json({ message: "Failed to fetch exam results" });
  }
};
