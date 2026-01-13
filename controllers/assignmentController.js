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
