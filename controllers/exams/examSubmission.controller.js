import pool from "../../db/postgres.js";
import { issueExamCertificate } from "../certificate.controller.js";
import { autoGradeDescriptive } from "./examdescriptive.controller.js";

const computeAndPersistResult = async (client, examId, studentId) => {
  /* =========================
     1️⃣ FETCH ALL QUESTIONS
  ========================= */
  const { rows: questions } = await client.query(
    `
    SELECT question_id, marks, question_type
    FROM exam_questions
    WHERE exam_id = $1
    `,
    [examId]
  );

  let totalMarks = 0;
  questions.forEach(q => {
    totalMarks += q.marks;
  });

  /* =========================
     2️⃣ FETCH SAVED ANSWERS
  ========================= */
  const { rows: savedAnswers } = await client.query(
    `
    SELECT 
      ea.question_id,
      ea.selected_option_id,
      ea.answer_text,
      ea.marks_obtained,
      eq.question_type,
      eq.marks,
      eo.is_correct,
      eo.option_id,
      pg_typeof(ea.selected_option_id) as selected_option_type,
      pg_typeof(eo.option_id) as option_id_type
    FROM exam_answers ea
    JOIN exam_questions eq 
      ON ea.question_id = eq.question_id
    LEFT JOIN exam_mcq_options eo
      ON ea.selected_option_id = eo.option_id
    WHERE ea.exam_id = $1
    AND ea.student_id = $2
    `,
    [examId, studentId]
  );

  console.log("📋 DEBUG - Saved Answers Retrieved:", JSON.stringify(savedAnswers, null, 2));

  // For each question, also fetch ALL available options to compare
  for (const answer of savedAnswers) {
    if (answer.question_type === "mcq") {
      const { rows: allOptions } = await client.query(
        `
        SELECT option_id, option_text, is_correct
        FROM exam_mcq_options
        WHERE question_id = $1
        ORDER BY option_order
        `,
        [answer.question_id]
      );
      console.log(`📝 Q${answer.question_id} - All options:`, allOptions);
      console.log(`📝 Q${answer.question_id} - Student selected: ${answer.selected_option_id} (type: ${typeof answer.selected_option_id})`);
    }
    
    if (answer.question_type === "descriptive") {
      console.log(`📝 Q${answer.question_id} - Descriptive answer:`, {
        answer_length: answer.answer_text?.length || 0,
        answer_preview: answer.answer_text?.substring(0, 100) + '...'
      });
    }
  }

  let obtainedMarks = 0;

  /* =========================
     3️⃣ CALCULATE MARKS
  ========================= */
  savedAnswers.forEach(answer => {
    console.log(`🔍 Checking answer for Q${answer.question_id}:`, {
      type: answer.question_type,
      selected_option_id: answer.selected_option_id,
      option_id_from_join: answer.option_id,
      is_correct: answer.is_correct,
      marks: answer.marks,
      types: {
        selected_option_id: typeof answer.selected_option_id,
        option_id: typeof answer.option_id
      }
    });

    if (answer.question_type === "mcq") {
      if (answer.is_correct) {
        obtainedMarks += answer.marks;
      } else {
      }
    }

    if (answer.question_type === "descriptive") {
      console.log(`📝 Descriptive Q${answer.question_id}:`, {
        stored_marks: answer.marks_obtained,
        answer_text_length: answer.answer_text?.length || 0
      });
      obtainedMarks += answer.marks_obtained || 0;
    }

    // Coding questions ignored for now
  });

  /* =========================
     3.5️⃣ AUTO-GRADE DESCRIPTIVE QUESTIONS
  ========================= */
  console.log("🤖 Auto-grading descriptive questions...");
  
  for (const answer of savedAnswers) {
    if (answer.question_type === "descriptive" && answer.answer_text) {
      // Fetch question details for grading criteria
      const { rows: questionDetails } = await client.query(
        `
        SELECT keywords, min_word_count, marks
        FROM exam_questions
        WHERE question_id = $1
        `,
        [answer.question_id]
      );

      if (questionDetails.length > 0) {
        const q = questionDetails[0];
        const calculatedMarks = autoGradeDescriptive(
          answer.answer_text,
          q.keywords,
          q.min_word_count || 30,
          q.marks
        );

        console.log(`🤖 Auto-graded Q${answer.question_id}:`, {
          answer_length: answer.answer_text.length,
          word_count: answer.answer_text.trim().split(/\s+/).length,
          min_word_count: q.min_word_count,
          keywords: q.keywords,
          max_marks: q.marks,
          calculated_marks: calculatedMarks,
          old_marks: answer.marks_obtained
        });

        // Update the marks_obtained in exam_answers
        await client.query(
          `
          UPDATE exam_answers
          SET marks_obtained = $1
          WHERE exam_id = $2
          AND question_id = $3
          AND student_id = $4
          `,
          [calculatedMarks, examId, answer.question_id, studentId]
        );

        // Add to obtainedMarks (subtract old value first since we already added it)
        obtainedMarks -= (answer.marks_obtained || 0);
        obtainedMarks += calculatedMarks;
      }
    }
  }

  /* =========================
     4️⃣ CALCULATE RESULT
  ========================= */
  const percentage =
    totalMarks === 0
      ? 0
      : Math.round((obtainedMarks / totalMarks) * 100);

  const { rows: exam } = await client.query(
    `
    SELECT pass_percentage
    FROM exams
    WHERE exam_id = $1
    `,
    [examId]
  );

  if (!exam.length) {
    throw new Error("Exam not found");
  }

  const passed = percentage >= exam[0].pass_percentage;

  /* =========================
     5️⃣ SAVE RESULT (UPSERT - ALLOW REWRITE)
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
    [examId, studentId, totalMarks, obtainedMarks, percentage, passed]
  );

  /* =========================
     6️⃣ MARK ATTEMPT AS SUBMITTED
  ========================= */
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

  return {
    totalMarks,
    obtainedMarks,
    percentage,
    passed
  };
};

const issueCertificateIfEligible = async (examId, studentId, percentage, passed) => {
  let certificateIssued = false;

  if (!passed) {
    return certificateIssued;
  }

  try {
    const hasCoding = await pool.query(
      `
      SELECT 1
      FROM exam_questions
      WHERE exam_id = $1
      AND question_type = 'coding'
      LIMIT 1
      `,
      [examId]
    );

    if (hasCoding.rows.length === 0) {
      const certResult = await issueExamCertificate({
        userId: studentId,
        examId,
        score: percentage
      });

      certificateIssued = certResult?.issued || false;
    }
  } catch (certErr) {
    console.error("Certificate error:", certErr);
  }

  return certificateIssued;
};

export const submitExam = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const studentId = req.user.id;

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

    if (!studentId) {
      return res.status(401).json({
        message: "Unauthorized: student ID not found"
      });
    }

    await client.query("BEGIN");

    const result = await computeAndPersistResult(client, examId, studentId);

    await client.query("COMMIT");

    const certificateIssued = await issueCertificateIfEligible(
      examId,
      studentId,
      result.percentage,
      result.passed
    );

    res.status(201).json({
      message: "Exam submitted successfully",
      totalMarks: result.totalMarks,
      obtainedMarks: result.obtainedMarks,
      percentage: result.percentage,
      passed: result.passed,
      certificateIssued
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Submit exam error:", err);

    res.status(500).json({
      message: "Failed to submit exam"
    });

  } finally {
    client.release();
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

    const result = await computeAndPersistResult(client, examId, studentId);

    await client.query("COMMIT");

    await issueCertificateIfEligible(
      examId,
      studentId,
      result.percentage,
      result.passed
    );

    console.log(`Auto-submitted exam ${examId} for student ${studentId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Auto submit error:", err);
  } finally {
    client.release();
  }
};

