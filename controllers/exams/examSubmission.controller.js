import pool from "../../db/postgres.js";
import { issueExamCertificate } from "../certificate.controller.js";
export const submitExam = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const studentId = req.user.id;
    if (!studentId) {
  return res.status(401).json({
    message: "Unauthorized: student ID not found"
  });
}
    const { answers } = req.body;

    const isArrayAnswers = Array.isArray(answers);
    const isObjectAnswers =
      answers && typeof answers === "object" && !Array.isArray(answers);

    if (
      !answers ||
      (isArrayAnswers && answers.length === 0) ||
      (isObjectAnswers && Object.keys(answers).length === 0)
    ) {
      return res.status(400).json({ message: "No answers submitted" });
    }

    const normalizedAnswers = isArrayAnswers
      ? answers
      : Object.entries(answers).map(([questionId, value]) => ({
          question_id: questionId,
          value
        }));

    await client.query("BEGIN");

    let totalMarks = 0;
    let obtainedMarks = 0;
    const { rows: questions } = await client.query(
      `
      SELECT question_id, marks, question_type
      FROM exam_questions
      WHERE exam_id = $1
      `,
      [examId]
    );

    const questionMap = {};
    questions.forEach((q) => {
      if (q.question_type === "mcq" || q.question_type === "descriptive") {
        questionMap[q.question_id] = q;
        totalMarks += q.marks;
      }
    });

    for (const ans of normalizedAnswers) {
      const question = questionMap[ans.question_id];
      if (!question) continue;

      let marksObtained = 0;

      if (question.question_type === "mcq") {
        const selectedOptionId = ans.selected_option_id ?? null;
        const selectedOptionText =
          ans.selected_option_text ?? ans.value ?? ans.selected_option ?? null;
        let optionIdToStore = selectedOptionId;

        if (!optionIdToStore && selectedOptionText) {
          const optionLookup = await client.query(
            `
            SELECT option_id, is_correct
            FROM exam_mcq_options
            WHERE question_id = $1 AND option_text = $2
            `,
            [ans.question_id, String(selectedOptionText).trim()]
          );

          if (optionLookup.rows.length) {
            optionIdToStore = optionLookup.rows[0].option_id;
            if (optionLookup.rows[0].is_correct) {
              marksObtained = question.marks;
              obtainedMarks += marksObtained;
            }
          }
        }

        if (!optionIdToStore) {
          const err = new Error("MCQ option not found");
          err.status = 400;
          throw err;
        }

        const { rows } = await client.query(
          `
          SELECT is_correct
          FROM exam_mcq_options
          WHERE option_id = $1
          `,
          [optionIdToStore]
        );

        if (!marksObtained && rows.length && rows[0].is_correct) {
          marksObtained = question.marks;
          obtainedMarks += marksObtained;
        }

        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, selected_option_id, marks_obtained)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            examId,
            ans.question_id,
            studentId,
            optionIdToStore,
            marksObtained,
          ]
        );
      }

      if (question.question_type === "descriptive") {
        const answerText =
          ans.answer_text ?? ans.value ?? ans.text ?? ans.response ?? "";
        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, answer_text, marks_obtained)
          VALUES ($1, $2, $3, $4, NULL)
          `,
          [examId, ans.question_id, studentId, answerText]
        );
      }
      // Coding submissions are ignored for now.
    }

    const percentage =
      totalMarks === 0 ? 0 : Math.round((obtainedMarks / totalMarks) * 100);

    const { rows: exam } = await client.query(
      `
      SELECT pass_percentage
      FROM exams
      WHERE exam_id = $1
      `,
      [examId]
    );

    if (!exam.length) {
      const err = new Error("Exam not found");
      err.status = 404;
      throw err;
    }

    const passed = percentage >= exam[0].pass_percentage;

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

    await client.query("COMMIT");

    // Auto-issue certificate if exam passed and no coding questions present
    let certificateIssued = false;
    if (passed) {
      try {
        const hasCoding = await pool.query(
          `SELECT 1 FROM exam_questions WHERE exam_id = $1 AND question_type = 'coding' LIMIT 1`,
          [examId]
        );

        if (hasCoding.rows.length === 0) {
          const certResult = await issueExamCertificate({
            userId: studentId,
            examId,
            score: percentage
          });
          certificateIssued = certResult.issued;
        }
      } catch (certErr) {
        console.error("Certificate issuance error:", certErr);
        // Don't fail the exam submission if certificate fails
      }
    }

    res.status(201).json({
      message: "Exam submitted successfully",
      totalMarks,
      obtainedMarks,
      percentage,
      passed,
      certificateIssued
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Submit exam error:", err);
    const status = err.status || 500;
    res.status(status).json({
      message: err.status ? err.message : "Failed to submit exam"
    });
  } finally {
    client.release();
  }
};
