import pool from "../db/postgres.js";
import csv from "csv-parser";
import { Readable } from "stream";

export const addCourse = async (req, res) => {
  const instructor_id = req.user.id;
  const {
    title,
    description,
    category,
    thumbnail_url,
    difficulty,
    status,
    validity_value,
    validity_unit,
    schedule_start_at,
    price_type,
    price_amount,
    prereq_description,
    prereq_video_urls,
    prereq_pdf_url,
  } = req.body || {};

  try {
    // ✅ CALCULATE expires_at IN JS (no Postgres interval issues)
    let expiresAt = null;

    if (validity_value && validity_unit) {
      const now = new Date();

      if (validity_unit === "days") {
        now.setDate(now.getDate() + Number(validity_value));
      } else if (validity_unit === "months") {
        now.setMonth(now.getMonth() + Number(validity_value));
      } else if (validity_unit === "years") {
        now.setFullYear(now.getFullYear() + Number(validity_value));
      }

      expiresAt = now;
    }

    const query = `
      INSERT INTO courses (
        instructor_id,
        title,
        description,
        category,
        thumbnail_url,
        difficulty,
        status,
        validity_value,
        validity_unit,
        expires_at,
        schedule_start_at,
        price_type,
        price_amount,
        prereq_description,
        prereq_video_urls,
        prereq_pdf_url
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING *
    `;

    const values = [
      instructor_id, // $1
      title, // $2
      description, // $3
      category, // $4
      thumbnail_url || null, // $5
      difficulty || null, // $6
      status === "pending" ? "pending" : "draft", // $7
      validity_value || null, // $8
      validity_unit || null, // $9
      expiresAt, // $10 ✅ SIMPLE TIMESTAMP
      schedule_start_at || null, // $11
      price_type, // $12
      price_type === "paid" ? price_amount : null, // $13
      prereq_description || null,
      prereq_video_urls ? JSON.stringify(prereq_video_urls) : "[]",
      prereq_pdf_url || null,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      message: "Course created successfully",
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
    let { startDate, endDate } = req.query;

    // If no date filters provided, return all-time totals
    if (!startDate || !endDate) {
      const { rows } = await pool.query(
        `
        SELECT 
          COUNT(*) AS total_courses,
          AVG(rating) AS avg_rating
        FROM courses
        WHERE instructor_id = $1
        `,
        [instructorId],
      );

      return res.json({
        total_courses: rows[0].total_courses || 0,
        avg_rating: rows[0].avg_rating || 0,
        coursesChange: 0
      });
    }

    // Calculate previous period (same duration) for change percentages
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end - start;
    const prevEnd = new Date(start.getTime() - 86400000); // 1 day before start
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const prevStartDate = prevStart.toISOString().slice(0, 10);
    const prevEndDate = prevEnd.toISOString().slice(0, 10);

    // Current period - Courses created in this period
    const currentResult = await pool.query(
      `
      SELECT 
        COUNT(*) AS total_courses,
        AVG(rating) AS avg_rating
      FROM courses
      WHERE instructor_id = $1 AND created_at::date BETWEEN $2 AND $3
      `,
      [instructorId, startDate, endDate]
    );

    // Previous period - Courses created in previous period
    const prevResult = await pool.query(
      `
      SELECT COUNT(*) AS total_courses
      FROM courses
      WHERE instructor_id = $1 AND created_at::date BETWEEN $2 AND $3
      `,
      [instructorId, prevStartDate, prevEndDate]
    );

    const currentCourses = Number(currentResult.rows[0].total_courses) || 0;
    const prevCourses = Number(prevResult.rows[0].total_courses) || 0;
    const coursesChange = prevCourses > 0 ? ((currentCourses - prevCourses) / prevCourses * 100).toFixed(2) : 0;

    res.json({
      total_courses: currentCourses,
      avg_rating: currentResult.rows[0].avg_rating || 0,
      coursesChange
    });
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
         c.prereq_description,
        c.prereq_video_urls,
        c.prereq_pdf_url,

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
        c.difficulty,
        c.price_type,
        c.price_amount,
        c.schedule_start_at,
        c.thumbnail_url,
        c.instructor_id,
        u.full_name AS instructor_name
      FROM courses c
      LEFT JOIN users u ON u.user_id = c.instructor_id
      WHERE c.status = 'approved'
      AND EXISTS (
        SELECT 1
        FROM course_assignments ca
        WHERE ca.course_id = c.courses_id
          AND ca.student_id = $1
      )
      AND c.courses_id NOT IN (
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

export const bulkUploadCourses = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No CSV file uploaded" });
  }

  const results = [];
  const errors = [];
  let successCount = 0;

  try {
    // Parse CSV from buffer
    const stream = Readable.from(req.file.buffer.toString("utf-8"));

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("error", (err) => reject(err))
        .on("end", async () => {
          try {
            if (results.length === 0) {
              return reject(new Error("CSV file is empty"));
            }

            // Group by course_title
            const coursesMap = {};

            results.forEach((row, index) => {
              const courseTitle = row.course_title?.trim();
              if (!courseTitle) {
                errors.push({ row: index + 2, message: "Missing course_title" });
                return;
              }

              if (!coursesMap[courseTitle]) {
                coursesMap[courseTitle] = {
                  details: {
                    title: courseTitle,
                    category: row.category,
                    level: row.level,
                    validity: row.validity,
                    description: row.description,
                    thumbnail_url: row.thumbnail_url,
                    price_type: row.price_type,
                  },
                  modules: [],
                };
              }

              if (row.module_name) {
                coursesMap[courseTitle].modules.push({
                  title: row.module_name,
                  type: row.module_type,
                  duration: row.module_duration,
                  content_url: row.module_source,
                  notes: row.module_notes,
                });
              }
            });

            const client = await pool.connect();
            try {
              for (const courseTitle in coursesMap) {
                const courseData = coursesMap[courseTitle];
                const details = courseData.details;

                await client.query("BEGIN");
                try {
                  const isPaid = details.price_type?.toLowerCase() === "paid";
                  let difficulty = details.level || "Beginner";
                  difficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
                  if (!["Beginner", "Intermediate", "Advanced"].includes(difficulty)) {
                    difficulty = "Beginner";
                  }

                  let validityValue = details.validity ? parseInt(details.validity) : null;
                  let validityUnit = 'days';

                  // Safe interval construction
                  const expiresAtFragment = validityValue ? `NOW() + INTERVAL '${validityValue} days'` : "NULL";

                  const insertCourseQuery = `
                    INSERT INTO courses (
                      instructor_id, title, description, category, thumbnail_url, 
                      difficulty, status, validity_value, validity_unit, expires_at, 
                      price_type, price_amount
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${expiresAtFragment}, $10, $11)
                    RETURNING courses_id
                  `;

                  const courseRes = await client.query(insertCourseQuery, [
                    req.user.id,
                    details.title,
                    details.description,
                    details.category,
                    details.thumbnail_url,
                    difficulty,
                    "pending",
                    validityValue,
                    validityUnit,
                    isPaid ? "paid" : "free",
                    0
                  ]);

                  const courseId = courseRes.rows[0].courses_id;

                  for (let i = 0; i < courseData.modules.length; i++) {
                    const mod = courseData.modules[i];
                    let type = mod.type?.toLowerCase();
                    if (!['video', 'pdf', 'text_stream'].includes(type)) type = 'video';

                    let moduleId;

                    if (type === 'text_stream') {
                      // Text Stream Handling
                      let textContent = mod.content_url || "";
                      const isUrl = textContent.match(/^https?:\/\//i);

                      if (isUrl) {
                        // If it's a URL (Gamma, HTML, etc.), use fallback text for the stream
                        textContent = "This module contains a visual presentation or external document. Please refer to the content area below.";
                      }

                      // Split into chunks (simple space-based split for typewriter effect)
                      const chunks = textContent.split(/\s+/).filter(c => c.length > 0).map(c => c + " ");

                      const modRes = await client.query(
                        `INSERT INTO modules (course_id, title, type, content_url, duration_mins, module_order, notes)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING module_id`,
                        [
                          courseId,
                          mod.title,
                          type,
                          mod.content_url, // Keep original URL/Content in module record
                          mod.duration ? parseInt(mod.duration) : 0,
                          i + 1,
                          mod.notes || null
                        ]
                      );
                      moduleId = modRes.rows[0].module_id;

                      if (chunks.length > 0) {
                        const values = [];
                        const placeholders = [];
                        for (let k = 0; k < chunks.length; k++) {
                          values.push(moduleId, chunks[k], k, 1); // 1 sec duration per chunk
                          const offset = k * 4;
                          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                        }

                        const insertChunkQuery = `
                          INSERT INTO module_text_chunks (module_id, content, chunk_order, duration_seconds)
                          VALUES ${placeholders.join(', ')}
                        `;
                        await client.query(insertChunkQuery, values);
                      }

                    } else {
                      // Standard Video/PDF Handling
                      await client.query(
                        `INSERT INTO modules (course_id, title, type, content_url, duration_mins, module_order, notes)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                          courseId,
                          mod.title,
                          type,
                          mod.content_url,
                          mod.duration ? parseInt(mod.duration) : 0,
                          i + 1,
                          mod.notes || null
                        ]
                      );
                    }
                  }

                  await client.query("COMMIT");
                  successCount++;
                } catch (err) {
                  await client.query("ROLLBACK");
                  console.error(`Error creating course ${courseTitle}:`, err);
                  errors.push({ course: courseTitle, message: err.message });
                }
              }
            } finally {
              client.release();
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        });
    });

    res.json({
      message: "Bulk upload processed",
      successCount,
      errors,
    });

  } catch (err) {
    console.error("Bulk upload error:", err);
    res.status(err.message === "CSV file is empty" ? 400 : 500).json({
      message: err.message || "Server error during bulk upload"
    });
  }
};

export const searchInstructorCoursesAndModules = async (req, res) => {
  try {
    const { query } = req.query;
    const instructorId = req.user.id;

    if (!query || !query.trim()) {
      return res.json([]);
    }

    const searchTerm = `%${query.trim()}%`;

    // Search instructor's courses and modules
    const result = await pool.query(
      `SELECT * FROM (
        -- Search Instructor's Courses
        SELECT 
          c.courses_id AS id,
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
          $2::TEXT AS instructor_name,
          'course' AS type,
          NULL AS course_title
        FROM courses c
        WHERE c.instructor_id = $3
          AND (LOWER(c.title) LIKE LOWER($1)
            OR LOWER(COALESCE(c.description, '')) LIKE LOWER($1)
            OR LOWER(COALESCE(c.category, '')) LIKE LOWER($1))
        
        UNION ALL
        
        -- Search Instructor's Modules
        SELECT 
          m.module_id AS id,
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
          $2::TEXT AS instructor_name,
          'module' AS type,
          c.title AS course_title
        FROM modules m
        JOIN courses c ON m.course_id = c.courses_id
        WHERE c.instructor_id = $3
          AND (LOWER(m.title) LIKE LOWER($1)
            OR LOWER(COALESCE(m.notes, '')) LIKE LOWER($1))
      ) AS combined_results
      ORDER BY created_at DESC
      LIMIT 20`,
      [searchTerm, req.user.full_name || 'Instructor', instructorId]
    );

    res.json(result.rows);
    
  } catch (error) {
    console.error('Instructor search error:', error);
    res.status(500).json({ 
      error: 'Failed to search courses and modules',
      message: error.message
    });
  }
};

export const submitForReview = async (req, res) => {
  try {
    const { courseId } = req.params;
    const instructorId = req.user.id;

    // Verify ownership and current status
    const courseCheck = await pool.query(
      `SELECT courses_id, status, title FROM courses 
       WHERE courses_id = $1 AND instructor_id = $2`,
      [courseId, instructorId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ 
        message: "Course not found or you don't have permission" 
      });
    }

    const course = courseCheck.rows[0];

    // Validate state transition
    if (course.status !== 'pending') {
      return res.status(400).json({ 
        message: `Cannot submit course in '${course.status}' status. Only draft courses can be submitted.` 
      });
    }

    // Check if course has at least one module
    const moduleCheck = await pool.query(
      `SELECT COUNT(*) as module_count FROM modules WHERE course_id = $1`,
      [courseId]
    );

    if (Number(moduleCheck.rows[0].module_count) === 0) {
      return res.status(400).json({ 
        message: "Course must have at least one module before submission" 
      });
    }

    // Update status to 'review'
    const result = await pool.query(
      `UPDATE courses 
       SET status = 'review', submitted_at = NOW()
       WHERE courses_id = $1
       RETURNING *`,
      [courseId]
    );

    res.status(200).json({
      message: "Course submitted for review successfully",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("submitForReview error:", error);
    res.status(500).json({ message: "Failed to submit course for review" });
  }
};

export const publishCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Verify course exists and is in review status
    const courseCheck = await pool.query(
      `SELECT courses_id, status, title FROM courses WHERE courses_id = $1`,
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = courseCheck.rows[0];

    if (course.status !== 'review') {
      return res.status(400).json({ 
        message: `Cannot approve course in '${course.status}' status. Only courses under review can be approved.` 
      });
    }

    // Update status to 'approved'
    const result = await pool.query(
      `UPDATE courses 
       SET status = 'approved'
       WHERE courses_id = $1
       RETURNING *`,
      [courseId]
    );

    res.status(200).json({
      message: "Course approved successfully",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("publishCourse error:", error);
    res.status(500).json({ message: "Failed to approve course" });
  }
};

export const rejectCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { reason } = req.body; // Optional rejection reason

    // Verify course exists and is in review status
    const courseCheck = await pool.query(
      `SELECT courses_id, status, title FROM courses WHERE courses_id = $1`,
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = courseCheck.rows[0];

    if (course.status !== 'review') {
      return res.status(400).json({ 
        message: `Cannot reject course in '${course.status}' status. Only courses under review can be rejected.` 
      });
    }

    // Update status back to 'draft'
    const result = await pool.query(
      `UPDATE courses 
       SET status = 'pending', submitted_at = NULL
       WHERE courses_id = $1
       RETURNING *`,
      [courseId]
    );

    res.status(200).json({
      message: reason ? `Course rejected: ${reason}` : "Course rejected and returned to draft",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("rejectCourse error:", error);
    res.status(500).json({ message: "Failed to reject course" });
  }
};

export const archiveCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify course exists and ownership
    const courseCheck = await pool.query(
      `SELECT courses_id, status, instructor_id, title FROM courses WHERE courses_id = $1`,
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = courseCheck.rows[0];

    // Check permission (admin or course owner)
    if (userRole !== 'admin' && course.instructor_id !== userId) {
      return res.status(403).json({ 
        message: "You don't have permission to archive this course" 
      });
    }

    if (course.status !== 'approved') {
      return res.status(400).json({ 
        message: `Cannot archive course in '${course.status}' status. Only approved courses can be archived.` 
      });
    }

    // Update status to 'archived'
    const result = await pool.query(
      `UPDATE courses 
       SET status = 'archived'
       WHERE courses_id = $1
       RETURNING *`,
      [courseId]
    );

    res.status(200).json({
      message: "Course archived successfully. It is now completely hidden from all users including enrolled students.",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("archiveCourse error:", error);
    res.status(500).json({ message: "Failed to archive course" });
  }
};

export const unarchiveCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify course exists and ownership
    const courseCheck = await pool.query(
      `SELECT courses_id, status, instructor_id, title FROM courses WHERE courses_id = $1`,
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ message: "Course not found" });
    }

    const course = courseCheck.rows[0];

    // Check permission (admin or course owner)
    if (userRole !== 'admin' && course.instructor_id !== userId) {
      return res.status(403).json({ 
        message: "You don't have permission to unarchive this course" 
      });
    }

    if (course.status !== 'archived') {
      return res.status(400).json({ 
        message: `Cannot unarchive course in '${course.status}' status. Only archived courses can be unarchived.` 
      });
    }

    // Update status back to 'published'
    const result = await pool.query(
      `UPDATE courses 
       SET status = 'approved'
       WHERE courses_id = $1
       RETURNING *`,
      [courseId]
    );

    res.status(200).json({
      message: "Course unarchived successfully. It's now live in the marketplace.",
      course: result.rows[0],
    });
  } catch (error) {
    console.error("unarchiveCourse error:", error);
    res.status(500).json({ message: "Failed to unarchive course" });
  }
};