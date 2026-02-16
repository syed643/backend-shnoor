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
      [studentId],
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
    'course_id', c.courses_id,
    'title', c.title,
    'thumbnail', c.thumbnail_url,
    'module_id', mp.module_id
  )
  FROM module_progress mp
  JOIN courses c ON c.courses_id = mp.course_id
  WHERE mp.student_id = u.user_id
  ORDER BY mp.last_accessed_at DESC NULLS LAST
  LIMIT 1
) AS last_learning



      FROM users u
      WHERE u.user_id = $1
      `,
      [studentId],
    );

    return res.json({
      ...rows[0],
      assignments_count: 0,
    });
  } catch (err) {
    console.error("Student dashboard error:", err);
    return res.status(500).json({
      message: "Failed to load student dashboard",
    });
  }
};

export const searchCourses = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || !query.trim()) {
      return res.json([]);
    }

    const searchTerm = `%${query.trim()}%`;

    // Search courses and modules with course details
    const result = await pool.query(
      `SELECT * FROM (
        -- Search Courses
        SELECT 
          c.courses_id AS id,
          c.courses_id AS course_id,
          c.title,
          c.description,
          c.category,
          c.status,
          c.difficulty,
          c.thumbnail_url,
          c.validity_value,
          c.validity_unit,
          c.expires_at,
          c.created_at,
          c.instructor_id,
          u.full_name AS instructor_name,
          'course' AS type,
          NULL AS course_title
        FROM courses c
        LEFT JOIN users u ON c.instructor_id = u.user_id
        WHERE c.status = 'approved'
          AND (LOWER(c.title) LIKE LOWER($1)
            OR LOWER(COALESCE(c.description, '')) LIKE LOWER($1)
            OR LOWER(COALESCE(c.category, '')) LIKE LOWER($1))
        
        UNION ALL
        
        -- Search Modules in approved courses
        SELECT 
          m.module_id AS id,
          c.courses_id AS course_id,
          m.title,
          c.description,
          c.category,
          c.status,
          c.difficulty,
          c.thumbnail_url,
          c.validity_value,
          c.validity_unit,
          c.expires_at,
          m.created_at,
          c.instructor_id,
          u.full_name AS instructor_name,
          'module' AS type,
          c.title AS course_title
        FROM modules m
        JOIN courses c ON m.course_id = c.courses_id
        LEFT JOIN users u ON c.instructor_id = u.user_id
        WHERE c.status = 'approved'
          AND (LOWER(m.title) LIKE LOWER($1)
            OR LOWER(COALESCE(m.notes, '')) LIKE LOWER($1))
      ) AS combined_results
      ORDER BY created_at DESC
      LIMIT 20`,
      [searchTerm]
    );

    res.json(result.rows);
    
  } catch (error) {
    console.error('Student search error:', error);
    res.status(500).json({ 
      error: 'Failed to search courses and modules',
      message: error.message
    });
  }
};