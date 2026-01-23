import pool from "../db/postgres.js";

export const addModules = async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }

    // ✅ SAFE PARSING
    let modules = [];

    if (typeof req.body.modules === "string") {
      modules = JSON.parse(req.body.modules);
    } else if (Array.isArray(req.body.modules)) {
      modules = req.body.modules;
    }

    const pdfFiles = req.files || [];

    if (modules.length === 0) {
      return res.status(200).json({
        message: "Course created without modules",
      });
    }

    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const pdf = pdfFiles[i] || null;

      await pool.query(
        `
        INSERT INTO modules (
          course_id,
          title,
          type,
          content_url,
          duration_mins,
          module_order,
          notes,
          pdf_data,
          pdf_filename,
          pdf_mime
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          courseId,
          m.title,
          m.type,
          m.content_url,
          m.duration || 0,
          m.order_index || i + 1,
          m.notes || null,
          pdf ? pdf.buffer : null,
          pdf ? pdf.originalname : null,
          pdf ? pdf.mimetype : null,
        ]
      );
    }

    res.status(201).json({
      message: "Modules added successfully",
      count: modules.length,
    });
  } catch (error) {
    console.error("addModules error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getModulesByCourse = async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        module_id,
        title,
        type,
        content_url,
        duration_mins,
        module_order,
        notes,
        pdf_filename,
        created_at
      FROM modules
      WHERE course_id = $1
      ORDER BY module_order ASC
      `,
      [courseId]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getModulesByCourse error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getModulePdf = async (req, res) => {
  const { moduleId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT pdf_data, pdf_filename, pdf_mime
      FROM modules
      WHERE module_id = $1
      `,
      [moduleId]
    );

    if (result.rows.length === 0 || !result.rows[0].pdf_data) {
      return res.status(404).json({ message: "PDF not found" });
    }

    const pdf = result.rows[0];

    res.setHeader("Content-Type", pdf.pdf_mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${pdf.pdf_filename}"`
    );

    res.send(pdf.pdf_data);
  } catch (error) {
    console.error("getModulePdf error:", error);
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
