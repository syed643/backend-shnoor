import pool from "../../db/postgres.js";

/**
 * Instructor adds DESCRIPTIVE question
 */
export const addDescriptiveQuestion = async (req, res) => {
  try {
    const { examId } = req.params;
    const { questionText, marks, order } = req.body;

    if (!questionText) {
      return res.status(400).json({
        message: "Question text is required",
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO exam_questions
        (exam_id, question_text, marks, question_order, question_type)
      VALUES ($1, $2, $3, $4, 'descriptive')
      RETURNING question_id
      `,
      [examId, questionText, marks ?? 10, order ?? 1]
    );

    res.status(201).json({
      message: "Descriptive question added successfully",
      questionId: rows[0].question_id,
    });
  } catch (err) {
    console.error("Add descriptive question error:", err);
    res.status(500).json({
      message: "Failed to add descriptive question",
    });
  }
};
