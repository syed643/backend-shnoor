import pool from "../db/postgres.js";

const normalizeCollegeName = (name) => {
  if (!name) return '';
  return name
    .toUpperCase()
    .trim()
    .replace(/[,.\-_()]/g, ' ') // Replace special chars with space
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
};

export const createGroup = async (req, res) => {
  const { group_name, group_type, start_date, end_date } = req.body;

  if (!group_name) {
    return res.status(400).json({ message: "Group name is required" });
  }

  if (!group_type || !['timestamp', 'manual', 'college'].includes(group_type)) {
    return res.status(400).json({ message: "Valid group_type is required: 'timestamp', 'manual', or 'college'" });
  }

  // Validate dates based on group type
  if (group_type === 'timestamp') {
    if (!start_date || !end_date) {
      return res.status(400).json({ message: "Both start date and end date are required for timestamp groups" });
    }
    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({ message: "Start date must be before end date" });
    }
  } else if (group_type === 'college' || group_type === 'manual') {
    if (start_date || end_date) {
      return res.status(400).json({ message: `No dates should be provided for ${group_type} groups` });
    }
  }

  const normalizedName = group_name
    .toUpperCase()
    .trim();

  try {
    // Check if group with same name already exists
    const existing = await pool.query(
      `SELECT group_id FROM groups WHERE 
        REGEXP_REPLACE(UPPER(TRIM(group_name)), '[,.\\-_() ]+', ' ', 'g') = 
        REGEXP_REPLACE($1, '[,.\\-_() ]+', ' ', 'g')`,
      [normalizedName]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "A group with the same name already exists" });
    }

    // Determine created_by based on group type
    const createdBy = (group_type === 'manual') ? (req.user?.id || null) : null;

    const result = await pool.query(
      `INSERT INTO groups (group_name, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING group_id, group_name, start_date, end_date, created_by, created_at`,
      [
        normalizedName,
        (group_type === 'timestamp') ? start_date : null,
        (group_type === 'timestamp') ? end_date : null,
        createdBy
      ]
    );

    const group = result.rows[0];
    console.log(`Group created: type=${group_type}, name=${group_name}`);

    res.status(201).json({ ...group, group_type });
  } catch (error) {
    console.error("createGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroups = async (req, res) => {
  try {
    console.log("Fetching groups...");
    const query = `
      SELECT 
        g.group_id, 
        g.group_name, 
        g.start_date, 
        g.end_date, 
        g.created_by, 
        g.created_at,
        CASE 
          -- Manual groups (created_by IS NOT NULL): count from group_users
          WHEN g.created_by IS NOT NULL THEN (
            SELECT COUNT(*)::int 
            FROM group_users gu 
            JOIN users u ON gu.user_id = u.user_id
            WHERE gu.group_id = g.group_id
              AND u.status = 'active'
              AND u.role = 'student'
          )
          -- Timestamp groups (start_date and end_date NOT NULL): count by registration date
          WHEN g.start_date IS NOT NULL AND g.end_date IS NOT NULL THEN (
            SELECT COUNT(*)::int
            FROM users u
            WHERE u.created_at >= g.start_date
              AND u.created_at <= g.end_date
              AND u.role = 'student'
              AND u.status = 'active'
          )
          -- College groups (both dates NULL and created_by NULL): count by college_name (normalized)
          ELSE (
            SELECT COUNT(*)::int
            FROM users u
            WHERE u."college" IS NOT NULL
              AND REGEXP_REPLACE(UPPER(TRIM(u."college")), '[,.\\-_() ]+', ' ', 'g') 
                 = REGEXP_REPLACE(UPPER(TRIM(g.group_name)), '[,.\\-_() ]+', ' ', 'g')
              AND u.role = 'student'
              AND u.status = 'active'
          )
        END AS user_count
      FROM groups g
      ORDER BY g.created_at DESC
    `;

    const result = await pool.query(query);
    console.log("Groups fetched:", result.rows.length);

    // Add group_type to response
    const groupsWithType = result.rows.map((g) => {
      let group_type = 'college'; // default
      if (g.created_by) {
        group_type = 'manual';
      } else if (g.start_date && g.end_date) {
        group_type = 'timestamp';
      }
      return { ...g, group_type };
    });

    res.status(200).json(groupsWithType);
  } catch (error) {
    console.error("getGroups error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getGroup = async (req, res) => {
  const { groupId, id } = req.params;
  const resolvedId = groupId || id;

  console.log('getGroup called with id:', resolvedId);

  if (!resolvedId) {
    return res.status(400).json({ message: "Group ID is required" });
  }

  try {
    const groupResult = await pool.query(
      `SELECT group_id, group_name, start_date, end_date, created_by, created_at
       FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    const group = groupResult.rows[0];
    let group_type = 'college'; // default

    if (group.created_by) {
      // MANUAL GROUP
      group_type = 'manual';
      const userCountResult = await pool.query(
        `SELECT COUNT(*)::int AS user_count 
         FROM group_users gu
         JOIN users u ON gu.user_id = u.user_id
         WHERE gu.group_id = $1
           AND u.status = 'active'
           AND u.role = 'student'`,
        [resolvedId]
      );
      group.user_count = userCountResult.rows[0].user_count;
    } else if (group.start_date && group.end_date) {
      // TIMESTAMP GROUP
      group_type = 'timestamp';
      const userCountResult = await pool.query(
        `SELECT COUNT(*)::int AS user_count
         FROM users u
         WHERE u.created_at >= $1 
           AND u.created_at <= $2 
           AND u.role = 'student' 
           AND u.status = 'active'`,
        [group.start_date, group.end_date]
      );
      group.user_count = userCountResult.rows[0].user_count;
    } else {
      // COLLEGE GROUP
      group_type = 'college';
      const userCountResult = await pool.query(
        `SELECT COUNT(*)::int AS user_count
         FROM users u
         WHERE u."college" IS NOT NULL
           AND REGEXP_REPLACE(UPPER(TRIM(u."college")), '[,.\\-_() ]+', ' ', 'g') 
              = REGEXP_REPLACE(UPPER(TRIM($1)), '[,.\\-_() ]+', ' ', 'g')
           AND u.role = 'student'
           AND u.status = 'active'`,
        [group.group_name]
      );
      group.user_count = userCountResult.rows[0].user_count;
    }

    console.log('Group fetched successfully:', group.group_id);
    res.status(200).json({ ...group, group_type });
  } catch (error) {
    console.error("getGroup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getGroupUsers = async (req, res) => {
  const { groupId, id } = req.params;
  const resolvedId = groupId || id;

  try {
    const groupCheck = await pool.query(
      `SELECT group_name, start_date, end_date, created_by FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    const { group_name, start_date, end_date, created_by } = groupCheck.rows[0];

    if (created_by) {
      // MANUAL GROUP: Get students from group_users table
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
           AND u.status = 'active'
           AND u.role = 'student'
         ORDER BY gu.assigned_at`,
        [resolvedId]
      );
      return res.status(200).json(result.rows);
    } else if (start_date && end_date) {
      // TIMESTAMP GROUP: Get students by registration date (created_at)
      const result = await pool.query(
        `SELECT
           u.user_id,
           u.full_name,
           u.email,
           u.created_at AS assigned_at
         FROM users u
         WHERE u.created_at >= $1 
           AND u.created_at <= $2 
           AND u.role = 'student' 
           AND u.status = 'active'
         ORDER BY u.created_at`,
        [start_date, end_date]
      );
      return res.status(200).json(result.rows);
    } else {
      // COLLEGE GROUP: Get students by college_name (normalized)
      const result = await pool.query(
        `SELECT
           u.user_id,
           u.full_name,
           u.email,
           u.created_at AS assigned_at
         FROM users u
         WHERE u."college" IS NOT NULL
           AND REGEXP_REPLACE(UPPER(TRIM(u."college")), '[,.\\-_() ]+', ' ', 'g')
              = REGEXP_REPLACE(UPPER(TRIM($1)), '[,.\\-_() ]+', ' ', 'g')
           AND u.role = 'student'
           AND u.status = 'active'
         ORDER BY u.created_at`,
        [group_name]
      );
      return res.status(200).json(result.rows);
    }
  } catch (error) {
    console.error("getGroupUsers error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const addUserToGroup = async (req, res) => {
  const { groupId, id, userId } = req.params;
  const resolvedId = groupId || id;
  const { start_date, end_date } = req.body || {};

  try {
    const groupCheck = await pool.query(
      `SELECT group_name, created_by, start_date, end_date FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    const { created_by, start_date: groupStartDate, end_date: groupEndDate } = groupCheck.rows[0];

    // Check if user exists and is an active student
    const userCheck = await pool.query(
      `SELECT user_id, created_at FROM users WHERE user_id = $1 AND role = 'student' AND status = 'active'`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(400).json({ message: "Only active students can be added to groups" });
    }

    const user = userCheck.rows[0];

    if (created_by) {
      // MANUAL GROUP: Add to group_users table
      await pool.query(
        `INSERT INTO group_users (group_id, user_id, assigned_at, start_date, end_date)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (group_id, user_id)
         DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date`,
        [resolvedId, userId, start_date || null, end_date || null]
      );
      return res.status(200).json({ message: "Student added to manual group" });
    } else if (groupStartDate && groupEndDate) {
      // TIMESTAMP GROUP: Validate user's created_at is within the range
      if (user.created_at < new Date(groupStartDate) || user.created_at > new Date(groupEndDate)) {
        return res.status(400).json({
          message: `Student registration date (${user.created_at.toISOString()}) does not fall within the group's date range (${groupStartDate} to ${groupEndDate})`
        });
      }
      // Add to group_users for management purposes
      await pool.query(
        `INSERT INTO group_users (group_id, user_id, assigned_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [resolvedId, userId]
      );
      return res.status(200).json({ message: "Student added to timestamp group (date validated)" });
    } else {
      // COLLEGE GROUP: Update user's college_name
      const groupName = groupCheck.rows[0].group_name;
      const updateResult = await pool.query(
        `UPDATE users
         SET "college" = $1
         WHERE user_id = $2 AND role = 'student' AND status = 'active'`,
        [groupName, userId]
      );

      if (updateResult.rowCount === 0) {
        return res.status(400).json({ message: "Failed to add student to college group" });
      }

      return res.status(200).json({ message: "Student added to college group" });
    }
  } catch (error) {
    console.error("addUserToGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const removeUserFromGroup = async (req, res) => {
  const { groupId, id, userId } = req.params;
  const resolvedId = groupId || id;

  try {
    const groupCheck = await pool.query(
      `SELECT created_by, start_date, end_date, group_name FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    const { created_by, start_date, end_date, group_name } = groupCheck.rows[0];

    if (created_by) {
      // MANUAL GROUP: Remove from group_users table
      await pool.query(
        `DELETE FROM group_users WHERE group_id = $1 AND user_id = $2`,
        [resolvedId, userId]
      );
      return res.status(200).json({ message: "Student removed from manual group" });
    } else if (start_date && end_date) {
      // TIMESTAMP GROUP: Remove from group_users table
      await pool.query(
        `DELETE FROM group_users WHERE group_id = $1 AND user_id = $2`,
        [resolvedId, userId]
      );
      return res.status(200).json({ message: "Student removed from timestamp group" });
    } else {
      // COLLEGE GROUP: Remove by clearing the college field for this user
      const userCheck = await pool.query(
        `SELECT "college" FROM users WHERE user_id = $1 AND role = 'student' AND status = 'active'`,
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(400).json({ message: "Student not found" });
      }

      // Only clear college if it matches the group name
      const userCollege = userCheck.rows[0]["college"];
      if (userCollege) {
        // Normalize both for comparison
        const normalizeForComparison = (str) => str.toUpperCase().trim().replace(/[,.\-_() ]+/g, ' ').trim();
        if (normalizeForComparison(userCollege) === normalizeForComparison(group_name)) {
          await pool.query(
            `UPDATE users SET "college" = NULL WHERE user_id = $1`,
            [userId]
          );
          return res.status(200).json({ message: "Student removed from college group" });
        } else {
          return res.status(400).json({ message: "Student's college does not match this group" });
        }
      } else {
        return res.status(400).json({ message: "Student is not in this college group" });
      }
    }
  } catch (error) {
    console.error("removeUserFromGroup error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateGroup = async (req, res) => {
  const { groupId, id } = req.params;
  const resolvedId = groupId || id;
  const { group_name, start_date, end_date } = req.body;

  console.log('updateGroup called with id:', resolvedId, 'data:', { group_name, start_date, end_date });

  if (!group_name) {
    return res.status(400).json({ message: "Group name is required" });
  }

  const normalizedName = group_name.toUpperCase().trim();

  try {
    const groupCheck = await pool.query(
      `SELECT created_by, start_date, end_date FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if another group with same name exists
    const existingNameCheck = await pool.query(
      `SELECT group_id FROM groups WHERE 
        REGEXP_REPLACE(UPPER(TRIM(group_name)), '[,.\\-_() ]+', ' ', 'g') = 
        REGEXP_REPLACE($1, '[,.\\-_() ]+', ' ', 'g')
        AND group_id != $2`,
      [normalizedName, resolvedId]
    );

    if (existingNameCheck.rows.length > 0) {
      return res.status(409).json({ message: "A group with the same name already exists" });
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
      // Pure manual group (manual student selection):
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
      [normalizedName, newStartDate, newEndDate, newCreatedBy, resolvedId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    console.log('Group updated successfully:', result.rows[0].group_id);
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("updateGroup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteGroup = async (req, res) => {
  const { groupId, id } = req.params;
  const resolvedId = groupId || id;

  try {
    const groupCheck = await pool.query(
      `SELECT group_id FROM groups WHERE group_id = $1`,
      [resolvedId]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Remove memberships then delete group
    await pool.query(`DELETE FROM group_users WHERE group_id = $1`, [resolvedId]);

    const result = await pool.query(
      `DELETE FROM groups WHERE group_id = $1 RETURNING group_id`,
      [resolvedId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Group not found" });
    }

    return res.status(200).json({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("deleteGroup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};