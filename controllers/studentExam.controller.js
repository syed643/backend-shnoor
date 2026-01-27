import pool from "../db/postgres.js";

export const getStudentExams = async (req, res) => {
  const studentId = req.user.id;

  const { rows } = await pool.query(
    `
    SELECT
      e.exam_id,
      e.title,
      e.duration,
      e.pass_percentage,
      c.title AS course_title,
      er.exam_id IS NOT NULL AS attempted
    FROM exams e
    JOIN courses c ON c.courses_id = e.course_id
    JOIN student_courses sc ON sc.course_id = c.courses_id
    LEFT JOIN exam_results er
      ON er.exam_id = e.exam_id AND er.student_id = $1
    WHERE sc.student_id = $1
    ORDER BY e.created_at DESC
    `,
    [studentId],
  );

  res.json(rows);
};

export const getExamForAttempt = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id;

    /* =========================
       1️⃣ FETCH EXAM META
    ========================= */
    const examRes = await pool.query(
      `
      SELECT
        exam_id,
        title,
        duration,
        pass_percentage,
        course_id
      FROM exams
      WHERE exam_id = $1
      `,
      [examId],
    );

    if (examRes.rowCount === 0) {
      return res.status(404).json({ message: "Exam not found" });
    }

    const exam = examRes.rows[0];

    /* =========================
       2️⃣ ENROLLMENT CHECK
       (ONLY IF COURSE-LINKED)
    ========================= */
    if (exam.course_id) {
      const enrolled = await pool.query(
        `
        SELECT 1
        FROM student_courses
        WHERE student_id = $1 AND course_id = $2
        `,
        [studentId, exam.course_id],
      );

      if (enrolled.rowCount === 0) {
        return res.status(403).json({ message: "Not enrolled" });
      }
    }

    /* =========================
       3️⃣ FETCH QUESTIONS
    ========================= */
    const { rows } = await pool.query(
      `
      SELECT
        e.exam_id,
        e.title,
        e.duration,
        e.pass_percentage AS pass_score,

        COALESCE(
          json_agg(
            json_build_object(
              'id', q.question_id,
              'text', q.question_text,
              'type', q.question_type,
              'marks', q.marks,
              'options', (
                SELECT json_agg(o.option_text)
                FROM exam_mcq_options o
                WHERE o.question_id = q.question_id
              )
            )
            ORDER BY q.question_order
          ) FILTER (WHERE q.question_id IS NOT NULL),
          '[]'
        ) AS questions

      FROM exams e
      LEFT JOIN exam_questions q ON q.exam_id = e.exam_id
      WHERE e.exam_id = $1
      GROUP BY e.exam_id
      `,
      [examId],
    );

    /* =========================
       4️⃣ SEND RESPONSE
    ========================= */
    res.json(rows[0]);
  } catch (err) {
    console.error("getExamForAttempt error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const submitExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id;
    const { answers } = req.body;

    /* =========================
       1️⃣ PREVENT RE-ATTEMPT
    ========================= */
    const attempted = await pool.query(
      `
      SELECT 1
      FROM exam_submissions
      WHERE exam_id = $1 AND student_id = $2
      `,
      [examId, studentId]
    );

    if (attempted.rowCount > 0) {
      return res.status(400).json({
        message: "Exam already submitted",
      });
    }

    /* =========================
       2️⃣ SAVE RAW SUBMISSION
       (NO EVALUATION HERE)
    ========================= */
    await pool.query(
      `
      INSERT INTO exam_submissions
        (exam_id, student_id, answers, status, submitted_at)
      VALUES ($1, $2, $3, 'SUBMITTED', NOW())
      `,
      [examId, studentId, answers]
    );

    /* =========================
       3️⃣ RESPONSE
    ========================= */
    return res.status(200).json({
      message: "Exam submitted successfully",
      status: "SUBMITTED",
    });

  } catch (err) {
    console.error("submitExam error:", err);
    return res.status(500).json({
      message: "Failed to submit exam",
    });
  }
};


{/*export const submitExam = async (req, res) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id;
    const { answers } = req.body;

    // 1️⃣ Prevent re-attempt
    const attempted = await pool.query(
      `
      SELECT 1
      FROM exam_results
      WHERE exam_id = $1 AND student_id = $2
      `,
      [examId, studentId],
    );

    if (attempted.rowCount > 0) {
      return res.status(400).json({
        message: "Exam already submitted",
      });
    }

    // 2️⃣ Fetch correct answers
    const questions = await pool.query(
      `
  SELECT
    q.question_id,
    q.question_type,
    q.marks,
    o.option_text AS correct_answer
  FROM exam_questions q
  LEFT JOIN exam_mcq_options o
    ON o.question_id = q.question_id
   AND o.is_correct = true
  WHERE q.exam_id = $1
  `,
      [examId],
    );

    let score = 0;
    let total = 0;

    questions.rows.forEach((q) => {
      total += q.marks || 0;

      if (q.type === "mcq" && answers[q.question_id] === q.correct_answer) {
        score += q.marks;
      }
    });

    const percentage = total === 0 ? 0 : Math.round((score / total) * 100);

    // 3️⃣ Save raw submission (audit trail)
    await pool.query(
      `
      INSERT INTO exam_submissions (exam_id, student_id, answers)
      VALUES ($1, $2, $3)
      `,
      [examId, studentId, answers],
    );

    // 4️⃣ Save final result
    await pool.query(
      `
      INSERT INTO exam_results (exam_id, student_id, score, percentage)
      VALUES ($1, $2, $3, $4)
      `,
      [examId, studentId, score, percentage],
    );

    // 5️⃣ Award XP (backend-side)
    await pool.query(
      `
      UPDATE users
      SET xp = COALESCE(xp, 0) + 50
      WHERE user_id = $1
      `,
      [studentId],
    );

    return res.json({
      percentage,
      passed: percentage >= 60,
    });
  } catch (err) {
    console.error("submitExam error:", err);
    return res.status(500).json({
      message: "Failed to submit exam",
    });
  }
};*/}
