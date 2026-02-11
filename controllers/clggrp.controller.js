
import pool from "../db/postgres.js";

/**
 * Controller for Student Group Management
 */
export const createGroup = async (req, res) => {
    try {
        const { name, description } = req.body;
        const userId = req.user.id; // Using user_id from attachUser

        // Fetch creator's college
        const userRes = await pool.query("SELECT college FROM users WHERE user_id = $1", [userId]);
        const college = userRes.rows[0]?.college;

        if (!college) {
            return res.status(400).json({
                success: false,
                message: "College information is missing in your profile. Please update your profile first."
            });
        }

        // Create the group with an IF condition logic in the backend (college restriction)
        const newGroup = await pool.query(
            "INSERT INTO groups (name, description, college, creator_id) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, description, college, userId]
        );

        const group = newGroup.rows[0];

        // Automatically add the creator as the first member
        await pool.query("INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)", [group.group_id, userId]);

        res.status(201).json({ success: true, group });
    } catch (err) {
        console.error("Error creating group:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

export const joinGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Fetch group and user college info
        const groupRes = await pool.query("SELECT college FROM groups WHERE group_id = $1", [groupId]);
        const userRes = await pool.query("SELECT college FROM users WHERE user_id = $1", [userId]);

        if (groupRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Group not found." });
        }

        const groupCollege = groupRes.rows[0].college;
        const userCollege = userRes.rows[0]?.college;

        // THE IF CONDITION: Students from the same college can join
        if (groupCollege !== userCollege) {
            return res.status(403).json({
                success: false,
                message: `Privacy Violation: You belong to ${userCollege || 'Unknown'}, but this group is for ${groupCollege}. You can only join groups from your own college.`
            });
        }

        // Join the group
        await pool.query(
            "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [groupId, userId]
        );

        res.json({ success: true, message: "Successfully joined the group!" });
    } catch (err) {
        console.error("Error joining group:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

export const updateMeeting = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { meetingLink } = req.body;
        const userId = req.user.id;

        // Check if user is the creator
        const groupRes = await pool.query("SELECT creator_id FROM groups WHERE group_id = $1", [groupId]);
        if (groupRes.rows.length === 0) return res.status(404).json({ message: "Group not found" });

        if (groupRes.rows[0].creator_id !== userId) {
            return res.status(403).json({ success: false, message: "Only the group creator can update the meeting link." });
        }

        await pool.query("UPDATE groups SET meeting_link = $1, updated_at = NOW() WHERE group_id = $2", [meetingLink, groupId]);

        res.json({ success: true, message: "Meeting link updated successfully!", meetingLink });
    } catch (err) {
        console.error("Error updating meeting link:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

export const getMyGroups = async (req, res) => {
    try {
        const userId = req.user.id;
        const groups = await pool.query(`
            SELECT g.* FROM groups g
            JOIN group_members gm ON g.group_id = gm.group_id
            WHERE gm.user_id = $1
            ORDER BY g.updated_at DESC
        `, [userId]);
        res.json({ success: true, groups: groups.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching groups" });
    }
};

export const getAvailableGroups = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRes = await pool.query("SELECT college FROM users WHERE user_id = $1", [userId]);
        const college = userRes.rows[0]?.college;

        if (!college) {
            return res.json({ success: true, groups: [] });
        }

        const result = await pool.query(`
            SELECT g.* FROM groups g
            WHERE g.college = $1
            AND g.group_id NOT IN (SELECT group_id FROM group_members WHERE user_id = $2)
            ORDER BY g.created_at DESC
        `, [college, userId]);

        res.json({ success: true, groups: result.rows });
    } catch (err) {
        console.error("getAvailableGroups Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

export const getGroupMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const result = await pool.query(`
            SELECT 
                m.*,
                u.firebase_uid as sender_uid,
                u.full_name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.user_id
            WHERE m.group_id = $1
            ORDER BY m.created_at ASC
        `, [groupId]);

        res.json({ success: true, messages: result.rows });
    } catch (err) {
        console.error("getGroupMessages Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};