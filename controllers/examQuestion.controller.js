import pool from "../db/postgres.js";

/**
 * Instructor adds MCQ question
 */
export const addExamQuestion = async (req, res) => {
  try {
    const { examId } = req.params;
    const { questionText, options, correctOption, marks, order } = req.body;

    if (!questionText || !options || !correctOption) {
      return res.status(400).json({ message: "Invalid question data" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO exam_questions
        (exam_id, question_text, options, correct_option, marks, question_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING question_id
      `,
      [
        examId,
        questionText,
        options,
        correctOption,
        marks || 1,
        order
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Add question error:", err);
    res.status(500).json({ message: "Failed to add question" });
  }
};

/**
 * Student fetches exam questions (NO answers)
 */
export const getExamQuestionsForStudent = async (req, res) => {
  try {
    const { examId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        question_id,
        question_text,
        options,
        marks,
        question_order
      FROM exam_questions
      WHERE exam_id = $1
      ORDER BY question_order ASC
      `,
      [examId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Fetch questions error:", err);
    res.status(500).json({ message: "Failed to fetch questions" });
  }
};
