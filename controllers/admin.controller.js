import pool from "../db/postgres.js";

export const getDashboardStats = async (req, res) => {
  try {
    const studentsResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'student'",
    );
    const instructorsResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'instructor'",
    );
    const pendingCoursesResult = await pool.query(
      "SELECT COUNT(*) FROM courses WHERE status = 'pending'",
    );
    res.status(200).json({
      totalStudents: Number(studentsResult.rows[0].count),
      totalInstructors: Number(instructorsResult.rows[0].count),
      pendingCourses: Number(pendingCoursesResult.rows[0].count),
    });
  } catch (error) {
    console.error("Admin dashboard stats error:", error);
    res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, full_name AS name, email
FROM users
WHERE role IN ('student', 'user')
ORDER BY created_at DESC;
`,
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get students error:", error);
    res.status(500).json({ message: "Failed to fetch students" });
  }
};

export const assignCourses = async (req, res) => {
  const { studentIds, courseIds } = req.body;

  if (!studentIds?.length || !courseIds?.length) {
    return res.status(400).json({
      message: "studentIds and courseIds are required",
    });
  }

  try {
    const values = [];
    const placeholders = [];
    let index = 1;

    for (const studentId of studentIds) {
      for (const courseId of courseIds) {
        values.push(studentId, courseId);
        placeholders.push(`($${index}, $${index + 1})`);
        index += 2;
      }
    }

    const query = `
      INSERT INTO course_assignments (student_id, course_id)
      VALUES ${placeholders.join(",")}
      ON CONFLICT DO NOTHING
    `;

    await pool.query(query, values);

    res.status(200).json({
      message: "Courses assigned successfully",
    });
  } catch (error) {
    console.error("Assign courses error:", error);
    res.status(500).json({ message: "Failed to assign courses" });
  }
};

export const updateCourseStatus = async (req, res) => {
  const { courses_id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["approved", "rejected", "pending"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid status value",
    });
  }

  try {
    // ✅ Check if course exists
    const courseCheck = await pool.query(
      `SELECT courses_id FROM courses WHERE courses_id = $1`,
      [courses_id],
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Course not found",
      });
    }

    // ✅ Update course status
    const result = await pool.query(
      `UPDATE courses
       SET status = $1
       WHERE courses_id = $2
       RETURNING courses_id, title, status`,
      [status, courses_id],
    );

    res.status(200).json({
      message: `Course ${status} successfully`,
      course: result.rows[0],
    });
  } catch (error) {
    console.error("Update course status error:", error);
    res.status(500).json({
      message: "Failed to update course status",
    });
  }
};

export const getCoursesByStatus = async (req, res) => {
  const { status } = req.query;

  const allowedStatuses = ["pending", "approved", "rejected"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      message: "Invalid or missing status",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        c.courses_id,
        c.title,
        c.description,
        c.category,
        c.status,
        c.created_at,
        u.full_name AS instructor_name
      FROM courses c
      JOIN users u ON c.instructor_id = u.user_id
      WHERE c.status = $1
      ORDER BY c.created_at DESC
      `,
      [status],
    );

    res.status(200).json({
      courses: result.rows,
    });
  } catch (error) {
    console.error("getCoursesByStatus error:", error);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
};

export const getPendingCourses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
  c.courses_id,
  c.title,
  c.description,
  c.category,
  c.status,
  c.created_at,
  u.full_name AS instructor_name
FROM courses c
JOIN users u ON c.instructor_id = u.user_id
WHERE c.status = 'pending'
ORDER BY c.created_at DESC`,
    );

    res.status(200).json({
      courses: result.rows,
    });
  } catch (error) {
    console.error("Get pending courses error:", error);
    res.status(500).json({
      message: "Failed to fetch pending courses",
    });
  }
};

export const approveUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT user_id, role, status, created_at, headline FROM users WHERE user_id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = result.rows[0];

    if (user.role === "admin") {
      return res.status(403).json({
        message: "Admin accounts cannot be approved here",
      });
    }

    if (user.status === "active") {
      return res.status(400).json({
        message: "User is already approved",
      });
    }

    if (user.status === "blocked" || user.status === "rejected") {
      return res.status(400).json({
        message: "User cannot be approved",
      });
    }

    const updatedUser = await pool.query(
      `UPDATE users
       SET status = 'active'
       WHERE user_id = $1
       RETURNING user_id, role, status`,
      [userId],
    );

    // 🚀 AUTO-ASSIGN USER TO APPROPRIATE GROUPS
    let assignedGroups = [];
    if (user.role === "student") {
      try {
        console.log(`🔍 Starting group assignment for user ${userId}`);
        console.log(`   User Info: ${user.full_name}, Created at: ${user.created_at}, Headline: ${user.headline}`);

        // Strategy 1: Timestamp-based groups (date-based cohorts)
        // Find groups where user registration date falls within group date range
        if (user.created_at) {
          try {
            const timestampGroups = await pool.query(
              `SELECT group_id, group_name FROM groups 
               WHERE start_date IS NOT NULL 
               AND end_date IS NOT NULL
               AND start_date <= $1::timestamp
               AND end_date >= $1::timestamp`,
              [user.created_at]
            );

            console.log(`📅 Found ${timestampGroups.rows.length} matching timestamp groups`);

            for (const group of timestampGroups.rows) {
              try {
                console.log(`   ➕ Adding user to timestamp group: ${group.group_name}`);
                await pool.query(
                  `INSERT INTO group_users (group_id, user_id, assigned_at)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (group_id, user_id) DO NOTHING`,
                  [group.group_id, userId]
                );
                assignedGroups.push(group.group_name);
                console.log(`   ✅ Added to ${group.group_name}`);
              } catch (insertErr) {
                console.error(`   ❌ Failed to add to ${group.group_name}:`, insertErr.message);
              }
            }
          } catch (err) {
            console.error(`   ❌ Error checking timestamp groups:`, err.message);
          }
        }

        // Strategy 2: College/Headline based groups
        // If user has a headline/college, add to matching college group
        if (user.headline && user.headline.trim() !== "") {
          console.log(`👤 Checking for college group matching headline: "${user.headline}"`);
          try {
            const collegeGroup = await pool.query(
              `SELECT group_id, group_name FROM groups 
               WHERE UPPER(group_name) = UPPER($1)`,
              [user.headline]
            );

            if (collegeGroup.rows.length > 0) {
              console.log(`   ✅ Found college group: ${collegeGroup.rows[0].group_name}`);
              try {
                await pool.query(
                  `INSERT INTO group_users (group_id, user_id, assigned_at)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (group_id, user_id) DO NOTHING`,
                  [collegeGroup.rows[0].group_id, userId]
                );
                assignedGroups.push(collegeGroup.rows[0].group_name);
                console.log(`   ✅ Added to college group: ${collegeGroup.rows[0].group_name}`);
              } catch (insertErr) {
                console.error(`   ❌ Failed to add to college group:`, insertErr.message);
              }
            } else {
              console.log(`   ⚠️  No college group found for headline: "${user.headline}"`);
            }
          } catch (err) {
            console.error(`   ❌ Error checking college group:`, err.message);
          }
        } else {
          console.log(`⚠️  User has no headline/college info`);
        }

        console.log(`✅ Group assignment completed. Total groups assigned: ${assignedGroups.length}`);
        if (assignedGroups.length > 0) {
          console.log(`   Groups: ${assignedGroups.join(', ')}`);
        }
      } catch (error) {
        console.error("❌ Error auto-assigning user to groups:", error.message);
      }
    }

    res.json({
      message: "User approved successfully",
      user: updatedUser.rows[0],
    });
  } catch (error) {
    console.error("approveUser error:", error);
    res.status(500).json({
      message: "Failed to approve user",
    });
  }
};

export const getPendingUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         user_id,
         full_name,
         email,
         role,
         status,
         created_at
       FROM users
       WHERE status = 'pending'
       ORDER BY created_at DESC`,
    );

    res.json({
      users: result.rows,
    });
  } catch (error) {
    console.error("getPendingUsers error:", error);
    res.status(500).json({
      message: "Failed to fetch pending users",
    });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body; // 'active' | 'blocked'

    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET status = $1
      WHERE user_id = $2
      `,
      [status, userId],
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({ message: `User ${status} successfully` });
  } catch (err) {
    console.error("updateUserStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// 🔍 DEBUG ENDPOINT: Check what groups a user should be assigned to
export const debugUserGroups = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user info
    const userResult = await pool.query(
      `SELECT user_id, full_name, created_at, headline FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    // Get all groups
    const allGroups = await pool.query(
      `SELECT group_id, group_name, start_date, end_date, created_by FROM groups`
    );

    // Check timestamp groups
    const timestampMatches = [];
    for (const group of allGroups.rows) {
      if (group.created_by === null && group.start_date && group.end_date) {
        const isMatch = user.created_at >= group.start_date && user.created_at <= group.end_date;
        timestampMatches.push({
          group_id: group.group_id,
          group_name: group.group_name,
          user_created_at: user.created_at,
          group_start_date: group.start_date,
          group_end_date: group.end_date,
          isMatch: isMatch
        });
      }
    }

    // Check college groups
    let collegeMatch = null;
    if (user.headline) {
      const collegeGroups = await pool.query(
        `SELECT group_id, group_name FROM groups WHERE UPPER(group_name) = UPPER($1)`,
        [user.headline]
      );
      if (collegeGroups.rows.length > 0) {
        collegeMatch = collegeGroups.rows[0];
      }
    }

    // Get current group assignments
    const currentGroups = await pool.query(
      `SELECT gu.group_id, g.group_name FROM group_users gu 
       JOIN groups g ON gu.group_id = g.group_id 
       WHERE gu.user_id = $1`,
      [userId]
    );

    res.json({
      user: user,
      timestampGroupMatches: timestampMatches,
      collegeMatch: collegeMatch,
      currentAssignments: currentGroups.rows,
      allGroups: allGroups.rows
    });
  } catch (error) {
    console.error("debugUserGroups error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 🔍 DATABASE SCHEMA DIAGNOSTIC: Check all tables and their structure
export const diagnosticDatabaseSchema = async (req, res) => {
  try {
    const diagnostics = {};

    // 1. Check if tables exist and their structure
    const tables = ['users', 'groups', 'group_users', 'courses', 'course_assignments'];
    
    for (const tableName of tables) {
      try {
        const tableInfo = await pool.query(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY ordinal_position`,
          [tableName]
        );

        if (tableInfo.rows.length > 0) {
          diagnostics[tableName] = {
            exists: true,
            columns: tableInfo.rows,
            columnNames: tableInfo.rows.map(c => c.column_name)
          };
        } else {
          diagnostics[tableName] = { exists: false };
        }
      } catch (err) {
        diagnostics[tableName] = { exists: false, error: err.message };
      }
    }

    // 2. Count records in each table
    try {
      const userCount = await pool.query(`SELECT COUNT(*) as count FROM users`);
      diagnostics.userCount = userCount.rows[0].count;
    } catch (e) { diagnostics.userCount = 'Error'; }

    try {
      const groupCount = await pool.query(`SELECT COUNT(*) as count FROM groups`);
      diagnostics.groupCount = groupCount.rows[0].count;
    } catch (e) { diagnostics.groupCount = 'Error'; }

    try {
      const groupUsersCount = await pool.query(`SELECT COUNT(*) as count FROM group_users`);
      diagnostics.groupUsersCount = groupUsersCount.rows[0].count;
    } catch (e) { diagnostics.groupUsersCount = 'Error'; }

    // 3. Show sample data
    try {
      const sampleGroups = await pool.query(`SELECT * FROM groups LIMIT 5`);
      diagnostics.sampleGroups = sampleGroups.rows;
    } catch (e) { diagnostics.sampleGroups = []; }

    try {
      const sampleGroupUsers = await pool.query(`SELECT * FROM group_users LIMIT 5`);
      diagnostics.sampleGroupUsers = sampleGroupUsers.rows;
    } catch (e) { diagnostics.sampleGroupUsers = []; }

    try {
      const pendingStudents = await pool.query(`SELECT user_id, full_name, email, created_at FROM users WHERE role = 'student' AND status = 'pending' LIMIT 5`);
      diagnostics.pendingStudents = pendingStudents.rows;
    } catch (e) { diagnostics.pendingStudents = []; }

    // 4. Check constraints and indexes
    try {
      const constraints = await pool.query(
        `SELECT constraint_name, constraint_type
         FROM information_schema.table_constraints
         WHERE table_name IN ('group_users', 'groups', 'users')`
      );
      diagnostics.constraints = constraints.rows;
    } catch (e) { diagnostics.constraints = []; }

    res.json({
      timestamp: new Date().toISOString(),
      diagnostics: diagnostics,
      recommendations: generateRecommendations(diagnostics)
    });
  } catch (error) {
    console.error("diagnosticDatabaseSchema error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ HELPER: Bulk assign all active students to a group
export const bulkAssignStudentsToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Verify group exists
    const groupCheck = await pool.query(
      `SELECT group_id, group_name FROM groups WHERE group_id = $1`,
      [groupId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    const group = groupCheck.rows[0];

    // Get all active students (not including pending)
    const activeStudents = await pool.query(
      `SELECT user_id FROM users WHERE role = 'student' AND status = 'active'`
    );

    console.log(`📊 Found ${activeStudents.rows.length} active students to assign to group ${group.group_name}`);

    let assignedCount = 0;
    for (const student of activeStudents.rows) {
      try {
        await pool.query(
          `INSERT INTO group_users (group_id, user_id, assigned_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [groupId, student.user_id]
        );
        assignedCount++;
      } catch (err) {
        console.error(`Failed to assign student ${student.user_id}:`, err.message);
      }
    }

    console.log(`✅ Successfully assigned ${assignedCount} students to group ${group.group_name}`);

    res.json({
      message: `Successfully assigned ${assignedCount} students to group: ${group.group_name}`,
      groupId: groupId,
      groupName: group.group_name,
      studentsAssigned: assignedCount
    });
  } catch (error) {
    console.error("bulkAssignStudentsToGroup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

// Helper function to generate recommendations
function generateRecommendations(diagnostics) {
  const recommendations = [];

  if (!diagnostics.group_users?.exists) {
    recommendations.push({
      severity: 'CRITICAL',
      message: 'group_users table does not exist!',
      action: 'You need to create the group_users table with columns: group_id, user_id, assigned_at'
    });
  }

  if (diagnostics.groupCount === 0 || diagnostics.groupCount === '0') {
    recommendations.push({
      severity: 'WARNING',
      message: 'No groups exist in the database',
      action: 'Create at least one group before assigning users'
    });
  }

  if (diagnostics.groupUsersCount === 0 || diagnostics.groupUsersCount === '0') {
    recommendations.push({
      severity: 'INFO',
      message: 'No users have been assigned to groups yet',
      action: 'This is normal - assignments should happen when admin approves users'
    });
  }

  const requiredColumns = {
    users: ['user_id', 'full_name', 'email', 'role', 'status', 'created_at', 'headline'],
    groups: ['group_id', 'group_name', 'start_date', 'end_date', 'created_by'],
    group_users: ['group_id', 'user_id', 'assigned_at']
  };

  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (diagnostics[table]?.exists) {
      const tableColumns = diagnostics[table].columnNames;
      const missing = columns.filter(col => !tableColumns.includes(col));
      if (missing.length > 0) {
        recommendations.push({
          severity: 'ERROR',
          message: `Table '${table}' is missing columns: ${missing.join(', ')}`,
          action: `Add these columns to the ${table} table`
        });
      }
    }
  }

  return recommendations;
}