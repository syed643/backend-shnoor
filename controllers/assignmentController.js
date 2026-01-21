import pool from "../db/postgres.js";


export const assignCourseToStudent = async (req, res) => {
  const { course_id, student_id } = req.body;

  try {
    // 1️⃣ Ensure course exists and is approved
    const courseResult = await pool.query(
      `SELECT course_id
       FROM courses
       WHERE course_id = $1 AND status = 'approved'`,
      [course_id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        message: "Course not found or not approved",
      });
    }

    // 2️⃣ Ensure user exists and is a student
    const studentResult = await pool.query(
      `SELECT user_id
       FROM users
       WHERE user_id = $1 AND role = 'student' AND status = 'active'`,
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found or inactive",
      });
    }

    const existingAssignment = await pool.query(
      `SELECT assignment_id
       FROM course_assignments
       WHERE course_id = $1 AND student_id = $2`,
      [course_id, student_id]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(409).json({
        message: "Course already assigned to this student",
      });
    }

    // 4️⃣ Assign course
    await pool.query(
      `INSERT INTO course_assignments (course_id, student_id)
       VALUES ($1, $2)`,
      [course_id, student_id]
    );

    res.status(201).json({
      message: "Course assigned to student successfully",
    });
  } catch (error) {
    console.error("assignCourseToStudent error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMyCourses = async (req, res) => {
  try {
    const studentId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        c.courses_id,
        c.title,
        c.description,
        c.category,
        c.thumbnail_url,
        c.created_at,

        MAX(ca.assigned_at) AS assigned_at,
        COUNT(DISTINCT m.module_id) AS total_modules,
        COUNT(DISTINCT mp.module_id) AS completed_modules

      FROM course_assignments ca
      JOIN courses c
        ON ca.course_id = c.courses_id

      LEFT JOIN modules m
        ON m.course_id = c.courses_id

      LEFT JOIN module_progress mp
        ON mp.course_id = c.courses_id
       AND mp.student_id = ca.student_id
       AND mp.module_id = m.module_id

      WHERE ca.student_id = $1
        AND c.status = 'approved'

      GROUP BY c.courses_id
      ORDER BY assigned_at DESC
      `,
      [studentId]
    );

    const courses = result.rows.map(course => ({
      ...course,
      total_modules: Number(course.total_modules),
      completed_modules: Number(course.completed_modules),
      isCompleted:
        Number(course.total_modules) > 0 &&
        Number(course.total_modules) === Number(course.completed_modules),
    }));

    res.status(200).json(courses);
  } catch (error) {
    console.error("getMyCourses error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const unassignCourse = async (req, res) => {
  const { course_id, student_id } = req.body;

  try {
    const result = await pool.query(
      `DELETE FROM course_assignments
       WHERE course_id = $1 AND student_id = $2`,
      [course_id, student_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Assignment not found",
      });
    }

    res.status(200).json({
      message: "Course unassigned successfully",
    });
  } catch (error) {
    console.error("unassignCourse error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getPublishedCourses = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        courses_id,
        title,
        category,
        difficulty
        FROM courses
      WHERE status = 'approved'
      ORDER BY created_at DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("getPublishedCourses error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


export const enrollCourse = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { courseId } = req.body;

    await pool.query(
      `
      INSERT INTO course_assignments (course_id, student_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [courseId, studentId]
    );

    res.status(201).json({ message: "Enrolled successfully" });
  } catch (err) {
    console.error("enrollCourse error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getInstructorStudentCount = async (req, res) => {
  try {
    const instructorId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT COUNT(DISTINCT ca.student_id) AS total_students
      FROM course_assignments ca
      JOIN courses c ON ca.course_id = c.courses_id
      WHERE c.instructor_id = $1
      `,
      [instructorId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Instructor student count error:", err);
    res.status(500).json({ message: "Failed to fetch student count" });
  }
};

export const getInstructorEnrolledStudents = async (req, res) => {
  try {
    const instructorId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT
        u.user_id AS student_id,
        u.full_name AS student_name,
        c.title AS course_title
      FROM course_assignments ca
      JOIN users u ON ca.student_id = u.user_id
      JOIN courses c ON ca.course_id = c.courses_id
      WHERE c.instructor_id = $1
      ORDER BY u.full_name ASC
      `,
      [instructorId]
    );

    res.json(rows);
  } catch (err) {
    console.error("Fetch instructor students error:", err);
    res.status(500).json({ message: "Failed to fetch enrolled students" });
  }
};

