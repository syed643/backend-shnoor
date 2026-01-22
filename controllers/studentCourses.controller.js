import pool from "../db/postgres.js";

export const getStudentCourseById = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;

    // 1️⃣ Check assignment
    const assigned = await pool.query(
      `SELECT 1
       FROM course_assignments
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );

    if (assigned.rowCount === 0) {
      return res.status(403).json({ message: "Not assigned to this course" });
    }

    // 2️⃣ Fetch course
    const courseResult = await pool.query(
      `SELECT
         courses_id AS id,
         title,
         description
       FROM courses
       WHERE courses_id = $1 AND status = 'approved'`,
      [courseId]
    );

    if (courseResult.rowCount === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 3️⃣ Fetch modules (FIXED)
    const modulesResult = await pool.query(
      `SELECT
         module_id AS id,
         title,
         type,
         content_url AS url,
         duration_mins AS duration
       FROM modules
       WHERE course_id = $1
       ORDER BY module_order ASC`,
      [courseId]
    );

    // 4️⃣ Fetch progress
    const progressResult = await pool.query(
      `SELECT module_id
       FROM module_progress
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );

    const completedModules = progressResult.rows.map(r => r.module_id);

    res.json({
      ...courseResult.rows[0],
      modules: modulesResult.rows,
      completedModules,
    });

  } catch (error) {
    console.error("getStudentCourseById error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getInstructorStudentCount = async (req, res) => {
  try {
    const instructorId = req.user.id;

    const { rows } = await pool.query(
      `
      SELECT COUNT(DISTINCT sc.student_id) AS total_students
      FROM student_courses sc
      JOIN courses c ON sc.course_id = c.courses_id
      WHERE c.instructor_id = $1
      `,
      [instructorId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Instructor student count error:", err);
    res.status(500).json({ message: "Failed to fetch students count" });
  }
};

export const enrollStudent = async (req, res) => {
  const studentId = req.user.id;
  const { courseId } = req.params;

  await pool.query(
    `INSERT INTO student_courses (student_id, course_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [studentId, courseId]
  );

  res.json({ success: true });
};

export const checkEnrollmentStatus = async (req, res) => {
  const studentId = req.user.id;
  const { courseId } = req.params;

  const { rowCount } = await pool.query(
    `SELECT 1 FROM student_courses
     WHERE student_id = $1 AND course_id = $2`,
    [studentId, courseId]
  );

  res.json({ enrolled: rowCount > 0 });
};

export const getMyCourses = async (req, res) => {
  const studentId = req.user.id;

  const { rows } = await pool.query(
    `
    SELECT c.*
    FROM student_courses sc
    JOIN courses c ON c.courses_id = sc.course_id
    WHERE sc.student_id = $1
    `,
    [studentId]
  );

  res.json(rows);
};
