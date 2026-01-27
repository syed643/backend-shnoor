{/*import pool from "../db/postgres.js";

export const getStudentDashboard = async (req, res) => {
  try {
const studentId = req.user.id;


    // 1️⃣ Update streak
    await pool.query(
      `
      UPDATE users
      SET
        streak = CASE
          WHEN last_active_date = CURRENT_DATE THEN streak
          WHEN last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN streak + 1
          ELSE 1
        END,
        last_active_date = CURRENT_DATE
      WHERE user_id = $1
      `,
      [studentId]
    );

    // 2️⃣ Fetch dashboard data
    const { rows } = await pool.query(
      `
      SELECT
        u.xp,
        u.streak,

        (
          SELECT COUNT(DISTINCT mp.course_id)
          FROM module_progress mp
          WHERE mp.student_id = u.user_id
        ) AS enrolled_count,

        (
          SELECT json_build_object(
            'courseId', mp.course_id,
            'moduleId', mp.module_id
          )
          FROM module_progress mp
          WHERE mp.student_id = u.user_id
          ORDER BY mp.completed_at DESC NULLS LAST
          LIMIT 1
        ) AS last_learning

      FROM users u
      WHERE u.user_id = $1
      `,
      [studentId]
    );

    // 3️⃣ SINGLE response (IMPORTANT)
    return res.json({
      ...rows[0],
      assignments_count: 0
    });

  } catch (err) {
    console.error("Student dashboard error:", err);
    return res.status(500).json({
      message: "Failed to load student dashboard"
    });
  }
};*/}

import pool from "../db/postgres.js";
export const getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user.id;

    // 1️⃣ Update streak
    await pool.query(
      `
      UPDATE users
      SET
        streak = CASE
          WHEN last_active_date = CURRENT_DATE THEN streak
          WHEN last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN streak + 1
          ELSE 1
        END,
        last_active_date = CURRENT_DATE
      WHERE user_id = $1
      `,
      [studentId]
    );

    // 2️⃣ Fetch dashboard data
    const { rows } = await pool.query(
      `
      SELECT
        u.xp,
        u.streak,

        (
          SELECT COUNT(*)
          FROM student_courses sc
          WHERE sc.student_id = u.user_id
        ) AS enrolled_count,

        (
          SELECT json_build_object(
            'courseId', mp.course_id,
            'moduleId', mp.module_id
          )
          FROM module_progress mp
          WHERE mp.student_id = u.user_id
          ORDER BY mp.completed_at DESC NULLS LAST
          LIMIT 1
        ) AS last_learning

      FROM users u
      WHERE u.user_id = $1
      `,
      [studentId]
    );

    return res.json({
      ...rows[0],
      assignments_count: 0
    });

  } catch (err) {
    console.error("Student dashboard error:", err);
    return res.status(500).json({
      message: "Failed to load student dashboard"
    });
  }
};

