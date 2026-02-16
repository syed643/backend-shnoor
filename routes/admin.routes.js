import express from "express";
import {
  getDashboardStats,
  getAllStudents,
  assignCourses,
  updateCourseStatus,
  getCoursesByStatus,
  approveUser,
  getPendingUsers,
  getPendingCourses,
  updateUserStatus,
  debugUserGroups,
  diagnosticDatabaseSchema,
  bulkAssignStudentsToGroup,
  getNotificationsForUser
} from "../controllers/admin.controller.js";
import { getAllUsers } from "../controllers/user.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import pool from "../db/postgres.js";

const router = express.Router();

router.get(
  "/dashboard-stats",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getDashboardStats
);

router.get(
  "/students",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getAllStudents
);

router.post(
  "/assign-courses",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  assignCourses
);

router.get(
  "/courses",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getCoursesByStatus
);

router.get(
  "/notifications/:userId",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getNotificationsForUser
);

router.get(
  "/courses/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingCourses
);

router.patch(
  "/courses/:courses_id/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateCourseStatus
);

router.patch(
  "/users/:userId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  approveUser
);

router.get(
  "/users/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingUsers
);

router.put(
  "/users/:userId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateUserStatus
);

router.get(
  "/users",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getAllUsers
);

// 🔍 DEBUG ENDPOINT: Check group assignments for a user
router.get(
  "/debug/user/:userId/groups",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  debugUserGroups
);

// 🔍 DATABASE DIAGNOSTIC: Check database schema and structure
router.get(
  "/debug/database-schema",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  diagnosticDatabaseSchema
);

// ✅ HELPER: Bulk assign all active students to a group
router.post(
  "/bulk-assign-group/:groupId",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  bulkAssignStudentsToGroup
);

router.get(
  "/search-courses",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  async (req, res) => {
    try {
      console.log('📥 Search request received');
      console.log('Query:', req.query);
      
      const { query } = req.query;

      // Validate query parameter
      if (!query || query.trim().length === 0) {
        console.log('❌ Empty search query');
        return res.status(400).json({ 
          message: 'Search query is required',
          results: [] 
        });
      }

      const searchTerm = `%${query.trim()}%`;
      console.log('🔍 Searching for:', searchTerm);

      // SQL query to search courses and modules with instructor information
      const searchQuery = `
        SELECT * FROM (
          -- Search Courses
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
            u.full_name AS instructor_name,
            'course' AS type,
            NULL AS course_title
          FROM courses c
          LEFT JOIN users u ON c.instructor_id = u.user_id
          WHERE 
            LOWER(c.title) LIKE LOWER($1)
            OR LOWER(COALESCE(c.description, '')) LIKE LOWER($1)
            OR LOWER(COALESCE(c.category, '')) LIKE LOWER($1)
          
          UNION ALL
          
          -- Search Modules
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
            u.full_name AS instructor_name,
            'module' AS type,
            c.title AS course_title
          FROM modules m
          JOIN courses c ON m.course_id = c.courses_id
          LEFT JOIN users u ON c.instructor_id = u.user_id
          WHERE 
            LOWER(m.title) LIKE LOWER($1)
            OR LOWER(COALESCE(m.notes, '')) LIKE LOWER($1)
        ) AS combined_results
        ORDER BY created_at DESC
        LIMIT 20
      `;

      // Execute query
      const result = await pool.query(searchQuery, [searchTerm]);
      
      console.log(`✅ Found ${result.rows.length} results (courses + modules)`);
      
      // Return results
      res.json(result.rows);

    } catch (error) {
      console.error('❌ Search error:', error.message);
      console.error('Full error:', error);
      
      res.status(500).json({ 
        message: 'Failed to search courses and modules',
        error: error.message,
        results: []
      });
    }
  }
);

export default router;


