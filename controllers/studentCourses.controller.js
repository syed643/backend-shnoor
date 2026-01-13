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
