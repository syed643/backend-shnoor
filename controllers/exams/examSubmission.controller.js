import pool from "../../db/postgres.js";
export const submitExam = async (req, res) => {
  const client = await pool.connect();

  try {
    const { examId } = req.params;
    const studentId = req.user.user_id;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "No answers submitted" });
    }

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
      questionMap[q.question_id] = q;
      totalMarks += q.marks;
    });

    for (const ans of answers) {
      const question = questionMap[ans.question_id];
      if (!question) continue;

      let marksObtained = 0;

      if (question.question_type === "mcq") {
        const { rows } = await client.query(
          `
          SELECT is_correct
          FROM exam_mcq_options
          WHERE option_id = $1
          `,
          [ans.selected_option_id]
        );

        if (rows.length && rows[0].is_correct) {
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
            ans.selected_option_id,
            marksObtained,
          ]
        );
      }


      if (question.question_type === "descriptive") {
        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, answer_text, marks_obtained)
          VALUES ($1, $2, $3, $4, NULL)
          `,
          [examId, ans.question_id, studentId, ans.answer_text]
        );
      }

      if (question.question_type === "coding") {
        await client.query(
          `
          INSERT INTO exam_answers
            (exam_id, question_id, student_id, code_submission, marks_obtained)
          VALUES ($1, $2, $3, $4, NULL)
          `,
          [examId, ans.question_id, studentId, ans.code]
        );
      }
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

    const passed = percentage >= exam[0].pass_percentage;

    await client.query(
      `
      INSERT INTO exam_results
        (exam_id, student_id, total_marks, obtained_marks, percentage, passed)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [examId, studentId, totalMarks, obtainedMarks, percentage, passed]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Exam submitted successfully",
      totalMarks,
      obtainedMarks,
      percentage,
      passed,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Submit exam error:", err);
    res.status(500).json({ message: "Failed to submit exam" });
  } finally {
    client.release();
  }
};
