import pool from "../db/postgres.js";
import { autoGradeDescriptive } from "./exams/examdescriptive.controller.js";

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
      er.exam_id IS NOT NULL AS attempted,
      ea.status AS attempt_status
    FROM exams e
    JOIN courses c ON c.courses_id = e.course_id
    JOIN student_courses sc ON sc.course_id = c.courses_id
    LEFT JOIN exam_results er
      ON er.exam_id = e.exam_id AND er.student_id = $1
    LEFT JOIN exam_attempts ea
      ON ea.exam_id = e.exam_id AND ea.student_id = $1
    WHERE sc.student_id = $1
      AND (ea.status IS NULL OR ea.status != 'submitted')
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
       3️⃣ CHECK IF ALREADY SUBMITTED
    ========================= */
    const attemptCheck = await pool.query(
      `SELECT status FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`,
      [examId, studentId]
    );

    if (attemptCheck.rows.length > 0 && attemptCheck.rows[0].status === 'submitted') {
      return res.status(400).json({ 
        message: "Exam already submitted",
        alreadySubmitted: true
      });
    }

    await pool.query(
      `
      INSERT INTO exam_attempts (exam_id, student_id, status, start_time, end_time)
      VALUES ($1, $2, 'in_progress', NOW(), NOW() + ($3 * INTERVAL '1 minute'))
      ON CONFLICT (exam_id, student_id)
      DO UPDATE 
      SET status = 'in_progress',
          start_time = COALESCE(exam_attempts.start_time, EXCLUDED.start_time),
          end_time = COALESCE(exam_attempts.end_time, EXCLUDED.end_time),
          disconnected_at = NULL
      WHERE exam_attempts.status != 'submitted'
      RETURNING start_time, end_time
      `,
      [examId, studentId, exam.duration],
    );

    // DEBUG: Log the timestamps being set
    const debugAttempt = await pool.query(
      `SELECT start_time, end_time, NOW() as db_now FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`,
      [examId, studentId]
    );
    console.log("🔍 Attempt timestamps created/fetched:", {
      examId,
      duration: exam.duration,
      start_time: debugAttempt.rows[0].start_time,
      end_time: debugAttempt.rows[0].end_time,
      db_now: debugAttempt.rows[0].db_now,
      expected_duration_ms: exam.duration * 60 * 1000,
      actual_duration_ms: new Date(debugAttempt.rows[0].end_time) - new Date(debugAttempt.rows[0].start_time)
    });

    /* =========================
       4️⃣ FETCH QUESTIONS
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
               SELECT json_agg(json_build_object('id', o.option_id, 'text', o.option_text) ORDER BY o.option_order)
FROM exam_mcq_options o
WHERE o.question_id = q.question_id
  AND o.option_text IS NOT NULL
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
       5️⃣ SEND RESPONSE
    ========================= */
    const examPayload = rows[0];

    if (Array.isArray(examPayload?.questions)) {
      const hashString = (value) => {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
          hash = (hash << 5) - hash + value.charCodeAt(i);
          hash |= 0;
        }
        return hash >>> 0;
      };

      const seededRandom = (seed) => {
        let t = seed + 0x6d2b79f5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const shuffleWithSeed = (items, seed) => {
        for (let i = items.length - 1; i > 0; i -= 1) {
          const j = Math.floor(seededRandom(seed + i) * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
      };

      const baseSeed = hashString(`${studentId}:${examId}`);

      // ✅ Shuffle QUESTIONS safely (keeps objects intact)
      shuffleWithSeed(examPayload.questions, baseSeed);

      // ✅ Shuffle OPTIONS per MCQ safely
      examPayload.questions.forEach((question, index) => {
        if (question.type === "mcq" && Array.isArray(question.options)) {
          const optionSeed = baseSeed + hashString(`${question.id}:${index}`);
          shuffleWithSeed(question.options, optionSeed);
        }
      });
    }

    res.json(examPayload);
  } catch (err) {
    console.error("getExamForAttempt error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const submitExam = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const studentId = req.user.id;
    const { answers } = req.body;

    const { rows: attemptRows } = await client.query(
      `
      SELECT ea.end_time, e.disconnect_grace_time
      FROM exam_attempts ea
      JOIN exams e ON e.exam_id = ea.exam_id
      WHERE ea.exam_id = $1 AND ea.student_id = $2
      `,
      [examId, studentId]
    );

    if (!attemptRows.length) {
      return res.status(400).json({ message: "Exam attempt not found" });
    }

    const endTime = attemptRows[0].end_time;
    const graceSeconds = attemptRows[0].disconnect_grace_time || 0;
    const { rows: nowRows } = await client.query(`SELECT NOW() AS now`);
    const now = nowRows[0].now;

    const deadlineMs = new Date(endTime).getTime() + graceSeconds * 1000;

    if (new Date(now).getTime() > deadlineMs) {
      return res.status(403).json({ message: "Submission window closed" });
    }

    if (!answers || Object.keys(answers).length === 0) {
      return res.status(400).json({ message: "No answers submitted" });
    }

    await client.query("BEGIN");

    /* =========================
       1️⃣ CLEAR PREVIOUS ANSWERS (ALLOW REWRITE)
    ========================= */
    // Delete previous answers to allow clean resubmission
    await client.query(
      `
      DELETE FROM exam_answers
      WHERE exam_id = $1 AND student_id = $2
      `,
      [examId, studentId]
    );

    /* =========================
       2️⃣ FETCH QUESTIONS
    ========================= */
    const { rows: questions } = await client.query(
      `
      SELECT q.question_id, q.marks, q.question_type, o.option_id, o.is_correct
      FROM exam_questions q
      LEFT JOIN exam_mcq_options o ON q.question_id = o.question_id
      WHERE q.exam_id = $1
      `,
      [examId],
    );

    let totalMarks = 0;
    let obtainedMarks = 0;

    const questionMap = {};
    questions.forEach((q) => {
      if (!questionMap[q.question_id]) {
        questionMap[q.question_id] = q;
        totalMarks += q.marks;
      }
    });

    /* =========================
       3️⃣ SAVE ANSWERS (UPSERT)
    ========================= */
    for (const [questionId, answer] of Object.entries(answers)) {
      const questionIdNum = Number(questionId);
      const question = questionMap[questionId];
      if (!question) continue;

      let marksObtained = 0;

      if (question.question_type === "mcq") {
        const selectedOptionId = Number(answer);

        const correct = questions.find(
          (q) =>
            Number(q.question_id) === questionIdNum &&
            Number(q.option_id) === selectedOptionId &&
            q.is_correct,
        );

        if (correct) {
          marksObtained = question.marks;
          obtainedMarks += marksObtained;
        }

        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, selected_option_id, marks_obtained)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ON CONSTRAINT unique_answer_per_question
          DO UPDATE SET
            selected_option_id = EXCLUDED.selected_option_id,
            marks_obtained = EXCLUDED.marks_obtained
          `,
          [examId, questionIdNum, studentId, selectedOptionId, marksObtained],
        );
      }

      if (question.question_type === "descriptive") {
        const answerText = typeof answer === "string" ? answer : "";

        const { rows: questionDetails } = await client.query(
          `
          SELECT keywords, min_word_count, marks
          FROM exam_questions
          WHERE question_id = $1
          `,
          [questionIdNum]
        );

        const q = questionDetails[0];
        const calculatedMarks = q
          ? autoGradeDescriptive(
              answerText,
              q.keywords,
              q.min_word_count || 30,
              q.marks
            )
          : 0;

        obtainedMarks += calculatedMarks;

        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, answer_text, marks_obtained)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT ON CONSTRAINT unique_answer_per_question
          DO UPDATE SET
            answer_text = EXCLUDED.answer_text,
            marks_obtained = EXCLUDED.marks_obtained
          `,
          [examId, questionIdNum, studentId, answerText, calculatedMarks]
        );
      }
    }

    /* =========================
       4️⃣ CALCULATE RESULT
    ========================= */
    const percentage =
      totalMarks === 0 ? 0 : Math.round((obtainedMarks / totalMarks) * 100);

    const { rows } = await client.query(
      `SELECT pass_percentage FROM exams WHERE exam_id = $1`,
      [examId],
    );

    const passed = percentage >= rows[0].pass_percentage;

    /* =========================
       4️⃣ SAVE RESULT (UPSERT)
    ========================= */
    await client.query(
      `
      INSERT INTO exam_results
        (exam_id, student_id, total_marks, obtained_marks, percentage, passed, evaluated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (exam_id, student_id)
      DO UPDATE SET
        total_marks = EXCLUDED.total_marks,
        obtained_marks = EXCLUDED.obtained_marks,
        percentage = EXCLUDED.percentage,
        passed = EXCLUDED.passed,
        evaluated_at = NOW()
      `,
      [examId, studentId, totalMarks, obtainedMarks, percentage, passed],
    );

    await client.query(
      `
    UPDATE exam_attempts
    SET status = 'submitted',
      submitted_at = NOW(),
      disconnected_at = NULL
    WHERE exam_id = $1
    AND student_id = $2
    `,
      [examId, studentId],
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Exam submitted successfully",
      totalMarks,
      obtainedMarks,
      percentage,
      passed,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("submitExam error:", err);
    res.status(500).json({ message: "Failed to submit exam" });
  } finally {
    client.release();
  }
};


export const autoSubmitExam = async (studentId, examId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if already submitted
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

    // Submit with whatever answers saved so far
    await client.query(
      `
      UPDATE exam_attempts
      SET status = 'submitted',
          submitted_at = NOW(),
          disconnected_at = NULL
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
