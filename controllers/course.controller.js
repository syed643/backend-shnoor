import pool from "../db/postgres.js";

export const addCourse = async (req, res) => {
  const { title, description, category, thumbnail_url } = req.body;
  const instructor_id = req.user.id;

  try {
    const result = await pool.query(
      `INSERT INTO courses
       (instructor_id, title, description, category, thumbnail_url, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [instructor_id, title, description, category, thumbnail_url]
    );

    res.status(201).json({
      message: "Course created and sent for admin approval",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("addCourse error:", error);
    res.status(400).json({ message: error.message });
  }
};

export const getInstructorCourses = async (req, res) => {
  try {
const result = await pool.query(
  `
  SELECT
    c.courses_id,
    c.title,
    c.description,
    c.category,
    c.status,
    c.created_at,
    COALESCE(
      json_agg(
        json_build_object(
          'module_id', m.module_id,
          'title', m.title,
          'type', m.type,
          'duration', m.duration_mins,
          'order', m.module_order,
          'content_url', m.content_url
        )
        ORDER BY m.module_order
      ) FILTER (WHERE m.module_id IS NOT NULL),
      '[]'
    ) AS modules
  FROM courses c
  LEFT JOIN modules m ON m.course_id = c.courses_id
  WHERE c.instructor_id = $1
  GROUP BY c.courses_id
  ORDER BY c.created_at DESC
  `,
  [req.user.id]
);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getInstructorCourses error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getPendingCourses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.full_name AS instructor_name
       FROM courses c
       JOIN users u ON c.instructor_id = u.user_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getPendingCourses error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const approveCourse = async (req, res) => {
  const { courseId } = req.params;
  const { status } = req.body; // approved | rejected

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Invalid status value",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE courses
       SET status = $1
       WHERE course_id = $2
       RETURNING *`,
      [status, courseId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Course not found",
      });
    }

    res.status(200).json({
      message: `Course ${status} successfully`,
      course: result.rows[0],
    });
  } catch (error) {
    console.error("approveCourse error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getApprovedCourses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.full_name AS instructor_name
       FROM courses c
       JOIN users u ON c.instructor_id = u.user_id
       WHERE c.status = 'approved'
       ORDER BY c.created_at DESC`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getApprovedCourses error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

