import pool from "../../db/postgres.js";

export const createExam = async (req, res) => {
    try {
      const { title, description, duration, passPercentage, courseId, validity_value, validity_unit } = req.body;
      const instructorId = req.user.id;

      if (!title || !duration || !passPercentage) {
        return res.status(400).json({ message: "Missing required fields" });
      }
          // 🔥 RULE ENFORCEMENT
    if (!courseId) {
      // Standalone exam
      if (!validity_value || !validity_unit) {
        return res.status(400).json({
          message: "Standalone exams must have validity",
        });
      }
    } else {
      // Course-linked exam → force NULL
      if (validity_value || validity_unit) {
        return res.status(400).json({
          message: "Course-linked exams must not have validity",
        });
      }
    }

      const { rows } = await pool.query(
        `
        INSERT INTO exams
          (title, description, duration, pass_percentage, instructor_id, course_id, validity_value, validity_unit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING exam_id, title, duration, pass_percentage
        `,
        [title, description, duration, passPercentage, instructorId, courseId || null, validity_value || null, validity_unit || null]
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("Create exam error:", err);
      res.status(500).json({ message: "Failed to create exam" });
    }
  };

export const getInstructorExams = async (req, res) => {
    try {
      const instructorId = req.user.id;

      const { rows } = await pool.query(
        `
        SELECT exam_id, title, duration, pass_percentage, created_at
        FROM exams
        WHERE instructor_id = $1
        ORDER BY created_at DESC
        `,
        [instructorId]
      );

      res.json(rows);
    } catch (err) {
      console.error("Fetch instructor exams error:", err);
      res.status(500).json({ message: "Failed to fetch exams" });
    }
};

export const getAllExamsForStudents = async (req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT exam_id, title, duration, pass_percentage
        FROM exams
        ORDER BY created_at DESC
        `
      );

      res.json(rows);
    } catch (err) {
      console.error("Fetch exams error:", err);
      res.status(500).json({ message: "Failed to fetch exams" });
    }
  };

export const setExamGraceTimer = async (req, res) => {
  try {
    const { examId } = req.params;
    const { disconnect_grace_time } = req.body;

    // Role check
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can set grace timer" });
    }

    if (!disconnect_grace_time || disconnect_grace_time < 0) {
      return res.status(400).json({ message: "Invalid grace time" });
    }

    const { rowCount } = await pool.query(
      `
      UPDATE exams
      SET disconnect_grace_time = $1
      WHERE exam_id = $2
      `,
      [disconnect_grace_time, examId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }

    res.json({ message: "Grace timer updated successfully" });
  } catch (err) {
    console.error("Set grace timer error:", err);
    res.status(500).json({ message: "Failed to update grace timer" });
  }
};

export const getAllExamsAdmin = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rows } = await pool.query(`
      SELECT exam_id, title, duration, disconnect_grace_time
      FROM exams
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch exams" });
  }
};

export const saveAnswer = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id;
    const { questionId, selectedOptionId, answerText } = req.body;

    if (!questionId) {
      return res.status(400).json({ message: "Invalid data" });
    }

    // Fetch question type
    const { rows: questionRows } = await pool.query(
      `
      SELECT question_type, marks
      FROM exam_questions
      WHERE question_id = $1
      `,
      [questionId]
    );

    if (!questionRows.length) {
      return res.status(400).json({ message: "Invalid question" });
    }

    const question = questionRows[0];

    let marksObtained = 0;

    if (question.question_type === "mcq") {
      if (!selectedOptionId) {
        return res.status(400).json({ message: "Option required" });
      }

      const { rows } = await pool.query(
        `
        SELECT is_correct
        FROM exam_mcq_options
        WHERE option_id = $1
        AND question_id = $2
        `,
        [selectedOptionId, questionId]
      );

      console.log(`🔍 Checking option validity:`, {
        selectedOptionId,
        questionId,
        types: {
          selectedOptionId: typeof selectedOptionId,
          questionId: typeof questionId
        },
        found: rows.length > 0,
        is_correct: rows.length > 0 ? rows[0].is_correct : null
      });

      if (!rows.length) {
        return res.status(400).json({ message: "Invalid option" });
      }

      marksObtained = rows[0].is_correct ? question.marks : 0;

      console.log(`💾 Saving MCQ answer:`, {
        examId,
        questionId,
        studentId,
        selectedOptionId,
        marksObtained,
        is_correct: rows[0].is_correct
      });

      await pool.query(
        `
        INSERT INTO exam_answers
          (exam_id, question_id, student_id, selected_option_id, answer_text, marks_obtained)
        VALUES ($1, $2, $3, $4, NULL, $5)
        ON CONFLICT ON CONSTRAINT unique_answer_per_question
        DO UPDATE SET
          selected_option_id = EXCLUDED.selected_option_id,
          answer_text = NULL,
          marks_obtained = EXCLUDED.marks_obtained
        `,
        [examId, questionId, studentId, selectedOptionId, marksObtained]
      );

    } else if (question.question_type === "descriptive") {

      if (!answerText) {
        return res.status(400).json({ message: "Answer required" });
      }

      await pool.query(
        `
        INSERT INTO exam_answers
          (exam_id, question_id, student_id, selected_option_id, answer_text, marks_obtained)
        VALUES ($1, $2, $3, NULL, $4, 0)
        ON CONFLICT ON CONSTRAINT unique_answer_per_question
        DO UPDATE SET
          answer_text = EXCLUDED.answer_text,
          selected_option_id = NULL
        `,
        [examId, questionId, studentId, answerText]
      );
    }

    res.status(200).json({ message: "Answer saved" });

  } catch (err) {
    console.error("Save answer error:", err);
    res.status(500).json({ message: "Failed to save answer" });
  }
};

export const autoSubmitExam = async (studentId, examId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT status
      FROM exam_attempts
      WHERE exam_id = $1
      AND student_id = $2
      `,
      [examId, studentId]
    );

    if (!rows.length || rows[0].status === "submitted") {
      await client.query("ROLLBACK");
      return;
    }

    await client.query(
      `
      UPDATE exam_attempts
      SET status = 'submitted',
          submitted_at = NOW()
      WHERE exam_id = $1
      AND student_id = $2
      `,
      [examId, studentId]
    );

    await client.query("COMMIT");

    console.log(`Auto-submitted exam ${examId} for student ${studentId}`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Auto submit error:", err);
  } finally {
    client.release();
  }
};
export const createRewriteAttempt = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const studentId = req.user.id;

    await client.query("BEGIN");

    // Clear previous answers for fresh attempt
    await client.query(
      `
      DELETE FROM exam_answers
      WHERE exam_id = $1 AND student_id = $2
      `,
      [examId, studentId]
    );

    // Reset attempt status to in_progress  
    await client.query(
      `
      INSERT INTO exam_attempts (exam_id, student_id, status)
      VALUES ($1, $2, 'in_progress')
      ON CONFLICT (exam_id, student_id)
      DO UPDATE 
      SET status = 'in_progress',
          submitted_at = NULL
      `,
      [examId, studentId]
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Rewrite attempt created successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create rewrite attempt error:", err);
    res.status(500).json({ message: "Failed to create rewrite attempt" });
  } finally {
    client.release();
  }
};