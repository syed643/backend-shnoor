import pool from "../../db/postgres.js";

/**
 * Instructor: Get all submissions for an exam
 */
export const getExamSubmissions = async (req, res) => {
  try {
    const { examId } = req.params;
    const instructorId = req.user.user_id;

    // Verify exam ownership
    const examCheck = await pool.query(
      `SELECT exam_id FROM exams WHERE exam_id = $1 AND instructor_id = $2`,
      [examId, instructorId]
    );

    if (examCheck.rowCount === 0) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        ea.answer_id,
        ea.student_id,
        u.full_name AS student_name,
        eq.question_id,
        eq.question_text,
        eq.question_type,
        ea.answer_text,
        ea.code_submission,
        ea.marks_obtained,
        eq.marks AS total_marks
      FROM exam_answers ea
      JOIN exam_questions eq ON ea.question_id = eq.question_id
      JOIN users u ON ea.student_id = u.user_id
      WHERE ea.exam_id = $1
      ORDER BY u.full_name, eq.question_order
      `,
      [examId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Get exam submissions error:", error);
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
};

/**
 * Instructor: Evaluate descriptive answer
 */
export const evaluateDescriptiveAnswer = async (req, res) => {
  try {
    const { answerId } = req.params;
    const { marks } = req.body;

    if (marks === undefined) {
      return res.status(400).json({ message: "Marks required" });
    }

    await pool.query(
      `
      UPDATE exam_answers
      SET marks_obtained = $1
      WHERE answer_id = $2
      `,
      [marks, answerId]
    );

    res.json({ message: "Descriptive answer evaluated" });
  } catch (error) {
    console.error("Evaluate descriptive error:", error);
    res.status(500).json({ message: "Evaluation failed" });
  }
};

/**
 * Instructor: Evaluate coding answer (manual)
 */
export const evaluateCodingAnswer = async (req, res) => {
  try {
    const { answerId } = req.params;
    const { marks } = req.body;

    if (marks === undefined) {
      return res.status(400).json({ message: "Marks required" });
    }

    await pool.query(
      `
      UPDATE exam_answers
      SET marks_obtained = $1
      WHERE answer_id = $2
      `,
      [marks, answerId]
    );

    res.json({ message: "Coding answer evaluated" });
  } catch (error) {
    console.error("Evaluate coding error:", error);
    res.status(500).json({ message: "Evaluation failed" });
  }
};

/**
 * Instructor: Finalize exam result for a student
 */
export const finalizeExamResult = async (req, res) => {
  try {
    const { examId, studentId } = req.params;

    // Calculate total & obtained marks
    const marksResult = await pool.query(
      `
      SELECT
        SUM(eq.marks) AS total_marks,
        SUM(COALESCE(ea.marks_obtained, 0)) AS obtained_marks
      FROM exam_questions eq
      LEFT JOIN exam_answers ea
        ON eq.question_id = ea.question_id
        AND ea.student_id = $2
      WHERE eq.exam_id = $1
      `,
      [examId, studentId]
    );

    const totalMarks = Number(marksResult.rows[0].total_marks || 0);
    const obtainedMarks = Number(marksResult.rows[0].obtained_marks || 0);

    // Get pass percentage
    const exam = await pool.query(
      `SELECT pass_percentage FROM exams WHERE exam_id = $1`,
      [examId]
    );

    const passPercentage = exam.rows[0].pass_percentage;
    const percentage =
      totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

    const passed = percentage >= passPercentage;

    // Upsert result
    await pool.query(
      `
      INSERT INTO exam_results
        (exam_id, student_id, total_marks, obtained_marks, percentage, passed)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (exam_id, student_id)
      DO UPDATE SET
        obtained_marks = EXCLUDED.obtained_marks,
        percentage = EXCLUDED.percentage,
        passed = EXCLUDED.passed,
        evaluated_at = NOW()
      `,
      [
        examId,
        studentId,
        totalMarks,
        obtainedMarks,
        percentage,
        passed
      ]
    );

    res.json({
      message: "Exam result finalized",
      totalMarks,
      obtainedMarks,
      percentage,
      passed
    });
  } catch (error) {
    console.error("Finalize exam error:", error);
    res.status(500).json({ message: "Failed to finalize result" });
  }
};
