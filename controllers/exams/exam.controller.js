  import pool from "../../db/postgres.js";

  /**
   * Instructor creates an exam
   */
  export const createExam = async (req, res) => {
    try {
      const { title, description, duration, passPercentage } = req.body;
      const instructorId = req.user.id;

      if (!title || !duration || !passPercentage) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const { rows } = await pool.query(
        `
        INSERT INTO exams
          (title, description, duration, pass_percentage, instructor_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING exam_id, title, duration, pass_percentage
        `,
        [title, description, duration, passPercentage, instructorId]
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
      const instructorId = req.user.user_id;

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
