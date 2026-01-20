import pool from "../../db/postgres.js";

/**
 * Instructor adds CODING question
 */
export const addCodingQuestion = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const { title, description, marks, order, testcases } = req.body;

    if (!title || !description || !testcases || testcases.length === 0) {
      return res.status(400).json({
        message: "Coding question requires title, description, and test cases",
      });
    }

    await client.query("BEGIN");

    /* 1️⃣ Insert base question */
    const qRes = await client.query(
      `
      INSERT INTO exam_questions
        (exam_id, question_text, marks, question_order, question_type)
      VALUES ($1, $2, $3, $4, 'coding')
      RETURNING question_id
      `,
      [
        examId,
        title,          // short title stored here
        marks || 10,
        order || 1
      ]
    );

    const questionId = qRes.rows[0].question_id;

    /* 2️⃣ Insert coding metadata */
    const codingRes = await client.query(
      `
      INSERT INTO exam_coding_questions
        (question_id, title, description)
      VALUES ($1, $2, $3)
      RETURNING coding_id
      `,
      [questionId, title, description]
    );

    const codingId = codingRes.rows[0].coding_id;

    /* 3️⃣ Insert test cases */
    for (const tc of testcases) {
      await client.query(
        `
        INSERT INTO exam_coding_testcases
          (coding_id, input, expected_output, is_hidden)
        VALUES ($1, $2, $3, $4)
        `,
        [
          codingId,
          tc.input,
          tc.expected_output,
          tc.is_hidden || false
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Coding question added successfully",
      questionId,
      codingId,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Add coding question error:", err);
    res.status(500).json({ message: "Failed to add coding question" });
  } finally {
    client.release();
  }
};
