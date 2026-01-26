  import pool from "../../db/postgres.js";

  /**
   * Instructor creates an exam
   */
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

  /**
   * Instructor fetches their exams
   */
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

  /**
   * Student fetches all available exams
   */
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
