import pool from "../db/postgres.js";

export const addCourse = async (req, res) => {
  const {
    title,
    description,
    category,
    thumbnail_url,
    difficulty,
    status,
    validity_value,
    validity_unit,
  } = req.body;

  const instructor_id = req.user.id;

  try {
    let expiresAt = null;

    if (validity_value && validity_unit) {
      if (validity_unit === "days") {
        expiresAt = `NOW() + INTERVAL '${validity_value} days'`;
      } else if (validity_unit === "months") {
        expiresAt = `NOW() + INTERVAL '${validity_value} months'`;
      } else if (validity_unit === "years") {
        expiresAt = `NOW() + INTERVAL '${validity_value} years'`;
      }
    }

    const query = `
      INSERT INTO courses
      (
        instructor_id,
        title,
        description,
        category,
        thumbnail_url,
        difficulty,
        status,
        validity_value,
        validity_unit,
        expires_at
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        ${expiresAt ? expiresAt : "NULL"}
      )
      RETURNING *
    `;

    const values = [
      instructor_id,
      title,
      description,
      category,
      thumbnail_url || null,
      difficulty || null,
      status === "pending" ? "pending" : "draft",
      validity_value || null,
      validity_unit || null,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      message: "Course created with validity",
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
    c.difficulty,
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
      [req.user.id],
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
       ORDER BY c.created_at DESC`,
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
      [status, courseId],
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
       ORDER BY c.created_at DESC`,
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getApprovedCourses error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteCourse = async (req, res) => {
  const { courseId } = req.params;

  if (!courseId) {
    return res.status(400).json({ message: "courseId is required" });
  }

  try {
    /* 🔐 CHECK OWNERSHIP */
    const courseCheck = await pool.query(
      `
      SELECT courses_id
      FROM courses
      WHERE courses_id = $1 AND instructor_id = $2
      `,
      [courseId, req.user.id],
    );

    if (courseCheck.rows.length === 0) {
      return res.status(403).json({
        message: "You are not allowed to delete this course",
      });
    }

    /* 🧹 DELETE DEPENDENT DATA */
    await pool.query(`DELETE FROM modules WHERE course_id = $1`, [courseId]);

    await pool.query(`DELETE FROM course_assignments WHERE course_id = $1`, [
      courseId,
    ]);

    /* 🗑 DELETE COURSE */
    await pool.query(`DELETE FROM courses WHERE courses_id = $1`, [courseId]);

    res.status(200).json({
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("deleteCourse error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getApprovedCoursesForInstructor = async (req, res) => {
  try {
    const instructorId = req.user.id;

    const result = await pool.query(
      `
      SELECT c.courses_id, c.title
      FROM courses c
      WHERE c.status = 'approved'
        AND c.instructor_id = $1
      ORDER BY c.created_at DESC
      `,
      [instructorId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getApprovedCoursesForInstructor error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getInstructorCourseStats = async (req, res) => {
  try {
    const instructorId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_courses
      FROM courses
      WHERE instructor_id = $1
      `,
      [instructorId],
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Instructor course stats error:", err);
    res.status(500).json({ message: "Failed to fetch course stats" });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        c.courses_id,
        c.title,
        c.description,
        c.category,
        c.difficulty AS level,        -- 👈 FIX LEVEL
        c.created_at AS updatedAt, 

        json_build_object(            -- 👈 FIX INSTRUCTOR
          'name', u.full_name,
          'email', u.email
        ) AS instructor

      FROM courses c
      LEFT JOIN users u
        ON u.user_id = c.instructor_id

      WHERE c.courses_id = $1
      `,
      [courseId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("getCourseById error:", err);
    res.status(500).json({ message: "Failed to fetch course" });
  }
};

export const exploreCourses = async (req, res) => {
  try {
    const studentId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT
        c.courses_id,
        c.title,
        c.description,
        c.category,
        c.difficulty AS level,
        u.full_name AS instructorName
      FROM courses c
      LEFT JOIN users u ON u.user_id = c.instructor_id
      WHERE c.courses_id NOT IN (
        SELECT course_id
        FROM student_courses
        WHERE student_id = $1
      )
      ORDER BY c.created_at DESC
      `,
      [studentId],
    );

    res.json(rows);
  } catch (err) {
    console.error("Explore courses error:", err);
    res.status(500).json({ message: "Failed to load explore courses" });
  }
};
