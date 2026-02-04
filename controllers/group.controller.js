import pool from "../db/postgres.js";

export const createGroup = async (req, res) => {
  const { group_name, start_date, end_date } = req.body;

  if (!group_name) {
    return res.status(400).json({ message: "Group name is required" });
  }

  // For timestamp groups, require dates
  if (start_date || end_date) {
    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Both start date and end date are required for timestamp groups" });
    }
    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({ message: "Start date must be before end date" });
    }
  }

  const normalizedName = group_name.toUpperCase();

  try {
    // Check if group with same name already exists
    const existing = await pool.query(
      `SELECT group_id FROM groups WHERE UPPER(group_name) = $1`,
      [normalizedName]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "A group with the same name already exists" });
    }

    // CRITICAL FIX: For timestamp groups (both dates provided), created_by must be NULL
    // For manual groups (no dates), created_by should be the admin's ID
    const createdBy = (start_date && end_date) ? null : (req.user?.id || null);

    const result = await pool.query(
      `INSERT INTO groups (group_name, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING group_id, group_name, start_date, end_date, created_by, created_at`,
      [normalizedName, start_date || null, end_date || null, createdBy]
    );

    const group = result.rows[0];

    res.status(201).json(group);
  } catch (error) {
    console.error("createGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroups = async (req, res) => {
  try {
    console.log("Fetching groups...");
    let query = `
      SELECT g.group_id, g.group_name, g.start_date, g.end_date, g.created_by, g.created_at,
             CASE 
               -- Manual groups: count from group_users
               WHEN g.created_by IS NOT NULL THEN (
                 SELECT COUNT(*)::int FROM group_users gu WHERE gu.group_id = g.group_id
               )
               -- Timestamp groups: date-based cohorts (no college)
               WHEN g.created_by IS NULL AND g.start_date IS NOT NULL AND g.end_date IS NOT NULL THEN (
                 SELECT COUNT(*)::int
                 FROM users u
                 WHERE u.created_at >= g.start_date
                   AND u.created_at <= g.end_date
                   AND u.role = 'student'
                   AND (u.headline IS NULL OR u.headline = '')
               )
               -- College manual groups (admin-created, date-open)
               WHEN g.created_by IS NULL AND g.start_date IS NOT NULL AND g.end_date IS NULL THEN (
                 SELECT COUNT(*)::int FROM group_users gu WHERE gu.group_id = g.group_id
               )
               -- Automatic college groups from groups table
               ELSE (
                 SELECT COUNT(*)::int
                 FROM users u
                 WHERE UPPER(u.headline) = UPPER(g.group_name)
                   AND u.role = 'student'
               )
             END AS user_count
      FROM groups g
      ORDER BY g.created_at DESC`;

    // Try to add college groups if the view exists
    try {
      await pool.query('SELECT 1 FROM college_groups LIMIT 1');
      query = `
        SELECT g.group_id, g.group_name, g.start_date, g.end_date, g.created_by, g.created_at,
               CASE 
                 WHEN g.created_by IS NOT NULL THEN (
                   SELECT COUNT(*)::int FROM group_users gu WHERE gu.group_id = g.group_id
                 )
                 WHEN g.created_by IS NULL AND g.start_date IS NOT NULL AND g.end_date IS NOT NULL THEN (
                   SELECT COUNT(*)::int
                   FROM users u
                   WHERE u.created_at >= g.start_date
                     AND u.created_at <= g.end_date
                     AND u.role = 'student' AND u.status='active'
                     AND (u.headline IS NULL OR u.headline = '')
                 )
                 WHEN g.created_by IS NULL AND g.start_date IS NOT NULL AND g.end_date IS NULL THEN (
                   SELECT COUNT(*)::int FROM group_users gu WHERE gu.group_id = g.group_id
                 )
                 ELSE (
                   SELECT COUNT(*)::int
                   FROM users u
                   WHERE UPPER(u.headline) = UPPER(g.group_name)
                     AND u.role = 'student'
                 )
               END AS user_count
        FROM groups g
        UNION ALL
        SELECT cg.group_id,
               cg.group_name,
               cg.start_date,
               cg.end_date,
               NULL AS created_by,
               cg.created_at,
               (
                 SELECT COUNT(*)::int
                 FROM users u
                 WHERE UPPER(TRIM(u.headline)) = UPPER(TRIM(cg.group_name))
                   AND u.role = 'student'
               ) AS user_count
        FROM college_groups cg
        ORDER BY created_at DESC`;
    } catch (e) {
      console.log("College groups view not available:", e.message);
    }

    const result = await pool.query(query);
    console.log("Groups fetched:", result.rows.length);

    // For manual groups (created_by not null) that don't use timestamp logic,
    // send start_date as the group creation time so the frontend doesn't see 1970-01-01.
    const groupsWithDisplayDates = result.rows.map((g) =>
      g.created_by && !g.start_date
        ? { ...g, start_date: g.created_at }
        : g
    );

    res.status(200).json(groupsWithDisplayDates);
  } catch (error) {
    console.error("getGroups error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    // Check if it's a manual group
    const groupResult = await pool.query(
      `SELECT group_id, group_name, start_date, end_date, created_by, created_at
       FROM groups WHERE group_id = $1`,
      [groupId]
    );

    if (groupResult.rows.length > 0) {
      const group = groupResult.rows[0];
      if (group.created_by) {
        // Manual group (random/college-like manual groups)
        // If no start_date stored, expose created_at as start_date for display purposes
        if (!group.start_date) {
          group.start_date = group.created_at;
        }
        const userCountResult = await pool.query(
          `SELECT COUNT(*)::int AS user_count FROM group_users WHERE group_id = $1`,
          [groupId]
        );
        group.user_count = userCountResult.rows[0].user_count;
        return res.status(200).json(group);
      } else if (group.start_date && group.end_date) {
        // Timestamp group
        const userCountResult = await pool.query(
          `SELECT COUNT(*)::int AS user_count
           FROM users u
           WHERE u.created_at >= $1 AND u.created_at <= $2 AND u.role = 'student' AND (u.headline IS NULL OR u.headline = '')`,
          [group.start_date, group.end_date]
        );
        group.user_count = userCountResult.rows[0].user_count;
        return res.status(200).json(group);
      } else if (group.start_date && !group.end_date) {
        // College manual group
        const userCountResult = await pool.query(
          `SELECT COUNT(*)::int AS user_count FROM group_users WHERE group_id = $1`,
          [groupId]
        );
        group.user_count = userCountResult.rows[0].user_count;
        return res.status(200).json(group);
      } else {
        // College automatic group (from groups table)
        const userCountResult = await pool.query(
          `SELECT COUNT(*)::int AS user_count
           FROM users u
           WHERE UPPER(u.headline) = UPPER($1) AND u.role = 'student'`,
          [group.group_name]
        );
        group.user_count = userCountResult.rows[0].user_count;
        return res.status(200).json(group);
      }
    }

    // Check if it's a college group from the view
    try {
      await pool.query('SELECT 1 FROM college_groups LIMIT 1');
      const collegeResult = await pool.query(
        `SELECT group_id, group_name, start_date, end_date, created_at
         FROM college_groups WHERE group_id = $1`,
        [groupId]
      );

      if (collegeResult.rows.length > 0) {
        const group = collegeResult.rows[0];
        group.created_by = null;
        // Add user_count - use exact match since college_groups.group_name is the actual college name
        const userCountResult = await pool.query(
          `SELECT COUNT(*)::int AS user_count
           FROM users u
           WHERE u.headline = $1 AND u.role = 'student'`,
          [group.group_name]
        );
        group.user_count = userCountResult.rows[0].user_count;
        return res.status(200).json(group);
      }
    } catch (e) {
      console.log("College groups view not available:", e.message);
    }

    return res.status(404).json({ message: "Group not found" });
  } catch (error) {
    console.error("getGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroupUsers = async (req, res) => {
  const { groupId } = req.params;

  try {
    // Check if it's a manual group
    const groupCheck = await pool.query(`SELECT group_name, start_date, end_date, created_by FROM groups WHERE group_id = $1`, [groupId]);
    if (groupCheck.rows.length > 0) {
      const { start_date, end_date, created_by } = groupCheck.rows[0];
      if (created_by) {
        // Manual group
        const result = await pool.query(
          `SELECT
             u.user_id,
             u.full_name,
             u.email,
             gu.assigned_at,
             gu.start_date,
             gu.end_date
           FROM group_users gu
           JOIN users u ON gu.user_id = u.user_id
           WHERE gu.group_id = $1
           ORDER BY gu.assigned_at`,
          [groupId]
        );
        return res.status(200).json(result.rows);
      } else if (start_date && end_date) {
        // Timestamp group
        const result = await pool.query(
          `SELECT
             u.user_id,
             u.full_name,
             u.email,
             u.created_at AS assigned_at
           FROM users u
           WHERE u.created_at >= $1 AND u.created_at <= $2 AND u.role = 'student' AND (u.headline IS NULL OR u.headline = '')
           ORDER BY u.created_at`,
          [start_date, end_date]
        );
        return res.status(200).json(result.rows);
      } else if (start_date && !end_date) {
        // College manual group
        const result = await pool.query(
          `SELECT
             u.user_id,
             u.full_name,
             u.email,
             gu.assigned_at,
             gu.start_date,
             gu.end_date
           FROM group_users gu
           JOIN users u ON gu.user_id = u.user_id
           WHERE gu.group_id = $1
           ORDER BY gu.assigned_at`,
          [groupId]
        );
        return res.status(200).json(result.rows);
      } else {
        // College automatic group (from groups table)
        const collegeName = groupCheck.rows[0].group_name;
        const result = await pool.query(
          `SELECT
             u.user_id,
             u.full_name,
             u.email,
             u.created_at AS assigned_at
           FROM users u
           WHERE UPPER(u.headline) = UPPER($1) AND u.role = 'student'
           ORDER BY u.created_at`,
          [collegeName]
        );
        return res.status(200).json(result.rows);
      }
    } else {
      // Check if it's a college group from the view
      try {
        await pool.query('SELECT 1 FROM college_groups LIMIT 1');
        const collegeCheck = await pool.query(`SELECT group_name FROM college_groups WHERE group_id = $1`, [groupId]);
        if (collegeCheck.rows.length > 0) {
          const collegeName = collegeCheck.rows[0].group_name;
          // Use exact match since college_groups.group_name is the actual college name
          const result = await pool.query(
            `SELECT
               u.user_id,
               u.full_name,
               u.email,
               u.created_at AS assigned_at
             FROM users u
             WHERE u.headline = $1 AND u.role = 'student'
             ORDER BY u.created_at`,
            [collegeName]
          );
          return res.status(200).json(result.rows);
        }
      } catch (e) {
        console.log("College groups view not available:", e.message);
      }
      return res.status(404).json({ message: 'Group not found' });
    }
  } catch (error) {
    console.error("getGroupUsers error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const addUserToGroup = async (req, res) => {
  const { groupId, userId } = req.params;
  // Safely handle cases where there is no request body (e.g. manual selection without dates)
  const { start_date, end_date } = req.body || {};

  try {
    // Check if group is college group (created_by null)
    const groupCheck = await pool.query(`SELECT group_name, created_by, start_date, end_date FROM groups WHERE group_id = $1`, [groupId]);
    if (groupCheck.rows.length === 0) {
      // Check college view
      try {
        await pool.query('SELECT 1 FROM college_groups LIMIT 1');
        const collegeCheck = await pool.query(`SELECT group_name FROM college_groups WHERE group_id = $1`, [groupId]);
        if (collegeCheck.rows.length === 0) {
          return res.status(404).json({ message: "Group not found" });
        }
        // It's college group from view - update user's college name to exact match
        // Only allow adding ACTIVE students
        const groupName = collegeCheck.rows[0].group_name;
        const updateResult = await pool.query(
          `UPDATE users
           SET "headline/college_name" = $1
           WHERE user_id = $2 AND role = 'student' AND status = 'active'`,
          [groupName, userId]
        );
        if (updateResult.rowCount === 0) {
          return res
            .status(400)
            .json({ message: "Only active students can be added to college groups" });
        }
        return res.status(200).json({ message: "Student added to college group" });
      } catch (e) {
        console.log("College groups view not available:", e.message);
        return res.status(400).json({ message: "College groups not supported" });
      }
    }

    const { created_by, start_date: groupStartDate, end_date: groupEndDate } = groupCheck.rows[0];
    if (created_by || (groupStartDate && !groupEndDate)) {
      // Manual or college manual group
      await pool.query(
        `INSERT INTO group_users (group_id, user_id, assigned_at, start_date, end_date)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (group_id, user_id)
         DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date`,
        [groupId, userId, start_date || null, end_date || null]
      );
      return res.status(200).json({ message: "Student added to group" });
    }

    if (groupStartDate && groupEndDate) {
      // Timestamp group, cannot manually add
      return res.status(400).json({ message: "Cannot manually add students to timestamp-based groups" });
    }

    // College automatic group from groups table
    const groupName = groupCheck.rows[0].group_name;
    const updateResult = await pool.query(
      `UPDATE users
       SET headline = $1
       WHERE user_id = $2 AND role = 'student' AND status = 'active'`,
      [groupName, userId]
    );
    if (updateResult.rowCount === 0) {
      return res
        .status(400)
        .json({ message: "Only active students can be added to college groups" });
    }
    return res.status(200).json({ message: "Student added to college group" });
  } catch (error) {
    console.error("addUserToGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const removeUserFromGroup = async (req, res) => {
  const { groupId, userId } = req.params;

  try {
    // Check if group is college group
    const groupCheck = await pool.query(`SELECT group_name, created_by, start_date, end_date FROM groups WHERE group_id = $1`, [groupId]);
    if (groupCheck.rows.length === 0) {
      // Check college view
      try {
        await pool.query('SELECT 1 FROM college_groups LIMIT 1');
        const collegeCheck = await pool.query(`SELECT group_name FROM college_groups WHERE group_id = $1`, [groupId]);
        if (collegeCheck.rows.length === 0) {
          return res.status(404).json({ message: "Group not found" });
        }
        // It's college group from view
        await pool.query(`UPDATE users SET headline = NULL WHERE user_id = $1 AND role = 'student'`, [userId]);
        return res.status(200).json({ message: "Student removed from college group" });
      } catch (e) {
        console.log("College groups view not available:", e.message);
        return res.status(400).json({ message: "College groups not supported" });
      }
    }

    const { created_by, start_date, end_date } = groupCheck.rows[0];
    if (created_by || (start_date && !end_date)) {
      // Manual or college manual group
      await pool.query(`DELETE FROM group_users WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
      return res.status(200).json({ message: "Student removed from group" });
    }

    if (start_date && end_date) {
      // Timestamp group, cannot manually remove
      return res.status(400).json({ message: "Cannot manually remove students from timestamp-based groups" });
    }

    // College automatic group from groups table
    await pool.query(`UPDATE users SET headline = NULL WHERE user_id = $1 AND role = 'student'`, [userId]);
    return res.status(200).json({ message: "Student removed from college group" });
  } catch (error) {
    console.error("removeUserFromGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateGroup = async (req, res) => {
  const { groupId } = req.params;
  const { group_name, start_date, end_date } = req.body;

  if (!group_name) {
    return res.status(400).json({ message: "Group name is required" });
  }

  const normalizedName = group_name.toUpperCase();

  try {
    // First, check if this is a regular group row
    const groupCheck = await pool.query(
      `SELECT created_by, start_date, end_date FROM groups WHERE group_id = $1`,
      [groupId]
    );

    if (groupCheck.rows.length > 0) {
      // --- Regular groups (manual / timestamp / college-manual) ---
      // Check if another group with same name exists
      const existingNameCheck = await pool.query(
        `SELECT group_id FROM groups WHERE UPPER(group_name) = $1 AND group_id != $2`,
        [normalizedName, groupId]
      );

      if (existingNameCheck.rows.length > 0) {
        return res
          .status(409)
          .json({ message: "A group with the same name already exists" });
      }

      const existing = groupCheck.rows[0];

      let newStartDate = start_date || null;
      let newEndDate = end_date || null;
      let newCreatedBy = existing.created_by;

      // If this is an existing timestamp group (no created_by and both dates),
      // allow switching between timestamp / non-timestamp via dates.
      const isExistingTimestamp =
        !existing.created_by && existing.start_date && existing.end_date;

      if (isExistingTimestamp) {
        // If both dates are sent, keep as timestamp (created_by null)
        // If not, treat as non-timestamp (keep created_by as is, which is null)
        if (start_date && end_date) {
          newCreatedBy = null;
        }
      } else if (
        existing.created_by &&
        !existing.start_date &&
        !existing.end_date
      ) {
        // Pure manual/random group (manual student selection):
        // ignore any incoming dates to avoid accidentally converting it
        newStartDate = null;
        newEndDate = null;
        newCreatedBy = existing.created_by;
      }

      const result = await pool.query(
        `UPDATE groups
         SET group_name = $1,
             start_date = $2,
             end_date = $3,
             created_by = $4
         WHERE group_id = $5
         RETURNING group_id, group_name, start_date, end_date, created_by, created_at`,
        [normalizedName, newStartDate, newEndDate, newCreatedBy, groupId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      return res.status(200).json(result.rows[0]);
    }

    // --- College-based groups from the college_groups VIEW ---
    try {
      await pool.query("SELECT 1 FROM college_groups LIMIT 1");
      const collegeResult = await pool.query(
        `SELECT group_id, group_name, start_date, end_date, created_at
         FROM college_groups WHERE group_id = $1`,
        [groupId]
      );

      if (collegeResult.rows.length === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      // College groups are auto-derived from users. For now we:
      // - Ignore any incoming dates (must remain "ongoing", end_date = NULL)
      // - Ignore renaming, since group_id is derived from the college_name.
      // Just return the current definition so the edit UI doesn't break.
      const group = collegeResult.rows[0];
      group.created_by = null;
      return res.status(200).json(group);
    } catch (e) {
      console.error("updateGroup college_groups error:", e);
      return res.status(404).json({ message: "Group not found" });
    }
  } catch (error) {
    console.error("updateGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteGroup = async (req, res) => {
  const { groupId } = req.params;

  try {
    // First check if this is a regular group row
    const groupCheck = await pool.query(
      `SELECT group_id FROM groups WHERE group_id = $1`,
      [groupId]
    );

    if (groupCheck.rows.length > 0) {
      // Regular group: remove memberships then delete group
      await pool.query(`DELETE FROM group_users WHERE group_id = $1`, [groupId]);

      const result = await pool.query(
        `DELETE FROM groups WHERE group_id = $1 RETURNING group_id`,
        [groupId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      return res.status(200).json({ message: "Group deleted successfully" });
    }

    // If not in groups, it might be a college_groups (view) id.
    try {
      await pool.query("SELECT 1 FROM college_groups LIMIT 1");
      const collegeCheck = await pool.query(
        `SELECT group_name FROM college_groups WHERE group_id = $1`,
        [groupId]
      );

      if (collegeCheck.rows.length === 0) {
        return res.status(404).json({ message: "Group not found" });
      }

      const collegeName = collegeCheck.rows[0].group_name;

      // "Deleting" a college-based group means clearing the college_name
      // from all its students so the view no longer produces that group.
      await pool.query(
        `UPDATE users
         SET headline = NULL
         WHERE headline = $1
           AND role = 'student'`,
        [collegeName]
      );

      return res
        .status(200)
        .json({ message: "College-based group deleted successfully" });
    } catch (e) {
      console.error("deleteGroup college_groups error:", e);
      return res.status(404).json({ message: "Group not found" });
    }
  } catch (error) {
    console.error("deleteGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};