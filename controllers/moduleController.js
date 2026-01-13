import pool from "../db/postgres.js";

export const addModules = async (req, res) => {
  const { courseId, modules } = req.body;

  if (!courseId) {
    return res.status(400).json({ message: "courseId is required" });
  }

  if (!modules || modules.length === 0) {
    return res.status(200).json({
      message: "Course created without modules",
    });
  }

  const values = [];
  const placeholders = [];

  modules.forEach((m, index) => {
    const baseIndex = index * 6;

    placeholders.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
    );

    values.push(
      courseId,               
      m.title,                 
      m.type,                  
      m.content_url,           
      m.duration || 0,         
      m.order_index || index + 1 
    );
  });

  await pool.query(
    `
    INSERT INTO modules
    (course_id, title, type, content_url, duration_mins, module_order)
    VALUES ${placeholders.join(",")}
    `,
    values
  );

  res.status(201).json({
    message: "Modules added successfully",
    count: modules.length,
  });
};



export const getModulesByCourse = async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `SELECT
         module_id,
         title,
         type,
         content_url,
         duration_mins,
         module_order,
         created_at
       FROM modules
       WHERE course_id = $1
       ORDER BY module_order ASC`,
      [courseId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getModulesByCourse error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const deleteModule = async (req, res) => {
  const { moduleId } = req.params;

  try {
    // 🔐 Check instructor ownership via course
    const ownershipCheck = await pool.query(
      `SELECT m.module_id
       FROM modules m
       JOIN courses c ON m.course_id = c.course_id
       WHERE m.module_id = $1 AND c.instructor_id = $2`,
      [moduleId, req.user.id]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(403).json({
        message: "You are not allowed to delete this module",
      });
    }

    await pool.query(
      `DELETE FROM modules WHERE module_id = $1`,
      [moduleId]
    );

    res.status(200).json({
      message: "Module deleted successfully",
    });
  } catch (error) {
    console.error("deleteModule error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
