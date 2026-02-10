import pool from "../db/postgres.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

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

export const getModuleStream = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const studentId = req.user.id;

    // 1. Get Progress
    let progress = await pool.query(
      `SELECT current_chunk_index, completed_at FROM module_progress 
       WHERE module_id = $1 AND student_id = $2`,
      [moduleId, studentId]
    );

    let currentIndex = 0;
    let isCompleted = false;

    if (progress.rows.length === 0) {
      // First access, create progress entry
      // Fetch course_id first to avoid subquery issues with UUIDs
      const courseRes = await pool.query(`SELECT course_id FROM modules WHERE module_id = $1`, [moduleId]);

      if (courseRes.rows.length > 0) {
        const courseId = courseRes.rows[0].course_id;
        await pool.query(
          `INSERT INTO module_progress (module_id, student_id, course_id, current_chunk_index, last_accessed_at)
           VALUES ($1, $2, $3, 0, NOW())
           ON CONFLICT (module_id, student_id) DO NOTHING`,
          [moduleId, studentId, courseId]
        );
      } else {
        console.warn(`Module ${moduleId} not found when initializing progress`);
        return res.status(404).json({ message: "Module not found" });
      }
    } else {
      currentIndex = progress.rows[0].current_chunk_index || 0;
      isCompleted = !!progress.rows[0].completed_at;
    }

    // 2. Check Total Chunks
    const chunksRes = await pool.query(
      `SELECT chunk_id, content, chunk_order, duration_seconds 
       FROM module_text_chunks 
       WHERE module_id = $1 
       ORDER BY chunk_order ASC`,
      [moduleId]
    );
    const allChunks = chunksRes.rows;

    if (allChunks.length === 0) {
      return res.status(404).json({ message: "No content found for this module" });
    }

    // 3. If Completed, Return ALL chunks (Review Mode)
    if (isCompleted || currentIndex >= allChunks.length) {
      return res.json({
        completed: true,
        chunks: allChunks
      });
    }

    // 4. Return Accumulated Chunks (Streaming Mode)
    const chunksSoFar = allChunks.slice(0, currentIndex + 1);
    const currentChunk = chunksSoFar[chunksSoFar.length - 1];

    res.json({
      completed: false,
      chunks: chunksSoFar,
      currentChunk: currentChunk,
      index: currentIndex,
      total: allChunks.length
    });

  } catch (err) {
    console.error("getModuleStream error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const advanceModuleStream = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const studentId = req.user.id;

    // 1. Get Current Progress
    const progress = await pool.query(
      `SELECT current_chunk_index FROM module_progress 
       WHERE module_id = $1 AND student_id = $2`,
      [moduleId, studentId]
    );

    if (progress.rows.length === 0) {
      return res.status(400).json({ message: "No progress found. Start the module first." });
    }

    let currentIndex = progress.rows[0].current_chunk_index || 0;

    // 2. Get Total Chunks Count
    const countRes = await pool.query(
      `SELECT COUNT(*) as count FROM module_text_chunks WHERE module_id = $1`,
      [moduleId]
    );
    const totalChunks = parseInt(countRes.rows[0].count);

    // 3. Advance Index
    const nextIndex = currentIndex + 1;

    // 4. Update Progress
    console.log(`[AdvanceStream] Module: ${moduleId}, Student: ${studentId}, NextIndex: ${nextIndex}, Total: ${totalChunks}`);

    if (nextIndex >= totalChunks) {
      // Mark as Completed
      const updateRes = await pool.query(
        `UPDATE module_progress 
         SET current_chunk_index = $1, completed_at = NOW(), last_accessed_at = NOW()
         WHERE module_id = $2 AND student_id = $3
         RETURNING progress_id`,
        [totalChunks, moduleId, studentId]
      );

      if (updateRes.rowCount === 0) {
        console.warn(`[AdvanceStream] No progress record found to update for M:${moduleId} S:${studentId}`);
        return res.status(404).json({ message: "Progress record not found" });
      }

      // Also mark module completion in course_progress if needed (logic might be separate, but good to know)
      res.json({ completed: true, message: "Module completed" });
    } else {
      // Just Advance
      const updateRes = await pool.query(
        `UPDATE module_progress 
         SET current_chunk_index = $1, last_accessed_at = NOW()
         WHERE module_id = $2 AND student_id = $3`,
        [nextIndex, moduleId, studentId]
      );

      if (updateRes.rowCount === 0) {
        console.warn(`[AdvanceStream] No progress record found to update for M:${moduleId} S:${studentId}`);
        return res.status(404).json({ message: "Progress record not found" });
      }

      res.json({ completed: false, nextIndex });
    }

  } catch (err) {
    console.error(`[AdvanceStream Error] Module: ${req.params?.moduleId} User: ${req.user?.id}`, err);
    res.status(500).json({ message: "Server error marking progress" });
  }
};