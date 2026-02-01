import pool from "../db/postgres.js";

// Initialize Tables
// Initialize Tables (Reset)
export const initChatTables = async () => {
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        console.log("Re-initializing Chat Schemas (UUID Mode)...");
        // Drop tables to fix schema mismatches
        await pool.query(`DROP TABLE IF EXISTS messages CASCADE;`);
        await pool.query(`DROP TABLE IF EXISTS chats CASCADE;`);
        await pool.query(`DROP TABLE IF EXISTS files CASCADE;`);

        // Files Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                file_id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                data BYTEA NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Chats Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                chat_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                instructor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_instructor_student_chat UNIQUE (instructor_id, student_id)
            );
        `);

        // Messages Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
                sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                receiver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                attachment_file_id INT REFERENCES files(file_id),
                attachment_type VARCHAR(50),
                attachment_name TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Chat tables initialized successfully (UUIDs)");
    } catch (err) {
        console.error("❌ Error initializing chat tables:", err);
    }
};

// Verify/Fix Schema (Non-destructive)
export const verifyChatSchema = async () => {
    console.log("🔍 Verifying Chat Schema...");
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

        // Ensure tables exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chats (
                chat_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                instructor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_instructor_student_chat UNIQUE (instructor_id, student_id)
            );
        `);

        // Add updated_at if missing
        await pool.query(`
            ALTER TABLE chats 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        // Add is_read if missing
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
                sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                receiver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                attachment_file_id INT REFERENCES files(file_id),
                attachment_type VARCHAR(50),
                attachment_name TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Chat schema verified");
    } catch (err) {
        console.error("❌ Schema verification failed:", err);
    }
};

// GET /api/chats
export const getMyChats = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT 
                c.chat_id,
                c.created_at,
                c.updated_at,
                u.full_name as recipient_name,
                u.user_id as recipient_id,
                u.firebase_uid as recipient_uid, 
                u.role as recipient_role,
                (
                    SELECT text FROM messages m 
                    WHERE m.chat_id = c.chat_id 
                    ORDER BY m.created_at DESC LIMIT 1
                ) as last_message,
                (
                    SELECT COUNT(*)::int FROM messages m 
                    WHERE m.chat_id = c.chat_id 
                    AND m.is_read = FALSE 
                    AND m.sender_id != $1
                ) as unread_count
            FROM chats c
            JOIN users u ON (
                CASE 
                    WHEN c.student_id = $1 THEN c.instructor_id 
                    ELSE c.student_id 
                END = u.user_id
            )
            WHERE c.student_id = $1 OR c.instructor_id = $1
            ORDER BY c.updated_at DESC;
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error("GET /api/chats Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
};

// GET /api/chats/messages/:chatId
export const getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const result = await pool.query(`
            SELECT 
                m.*,
                u.firebase_uid as sender_uid,
                u.full_name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.user_id
            WHERE m.chat_id = $1
            ORDER BY m.created_at ASC
        `, [chatId]);

        const messages = result.rows.map(msg => ({
            ...msg,
            attachment_url: msg.attachment_file_id
                ? `${process.env.VITE_API_URL || 'http://localhost:5000'}/api/files/${msg.attachment_file_id}`
                : null
        }));

        res.json(messages);
    } catch (err) {
        console.error("GET /messages Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// POST /api/chats (Start a new conversation)
export const createChat = async (req, res) => {
    console.log("🔵 createChat endpoint hit");
    console.log("🔵 User from req.user:", req.user);
    console.log("🔵 Request body:", req.body);

    try {
        const { recipientId } = req.body;
        const userId = req.user.id;

        console.log("🔵 Creating chat between:", userId, "and", recipientId);

        const me = await pool.query("SELECT role FROM users WHERE user_id = $1", [userId]);
        const other = await pool.query("SELECT role FROM users WHERE user_id = $1", [recipientId]);

        if (me.rows.length === 0 || other.rows.length === 0) {
            console.log("❌ User not found");
            return res.status(404).json({ message: "User not found" });
        }

        let studentId, instructorId;
        const role = me.rows[0].role.toLowerCase(); // standardize check
        if (role === 'student' || role === 'learner') {
            studentId = userId;
            instructorId = recipientId;
        } else {
            studentId = recipientId;
            instructorId = userId;
        }

        console.log("🔵 Student:", studentId, "Instructor:", instructorId);

        // Check if exists
        const check = await pool.query(
            "SELECT chat_id FROM chats WHERE student_id = $1 AND instructor_id = $2",
            [studentId, instructorId]
        );

        if (check.rows.length > 0) {
            console.log("✅ Chat exists:", check.rows[0].chat_id);
            return res.json({ chat_id: check.rows[0].chat_id, isNew: false });
        }

        const newChat = await pool.query(
            "INSERT INTO chats (student_id, instructor_id) VALUES ($1, $2) RETURNING chat_id",
            [studentId, instructorId]
        );

        console.log("✅ New chat created:", newChat.rows[0].chat_id);
        res.json({ chat_id: newChat.rows[0].chat_id, isNew: true });
    } catch (err) {
        console.error("❌ Create Chat Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
};

// PUT /api/chats/read
export const markRead = async (req, res) => {
    try {
        const { chatId } = req.body;
        const userId = req.user.id;

        await pool.query(
            "UPDATE messages SET is_read = TRUE WHERE chat_id = $1 AND sender_id != $2",
            [chatId, userId]
        );
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
};

// POST /api/files/upload
export const uploadFile = async (req, res) => {
    try {
        if (!req.file) return res.status(400).send("No file uploaded");
        const { originalname, mimetype, buffer } = req.file;

        const newFile = await pool.query(
            "INSERT INTO files (filename, mime_type, data) VALUES ($1, $2, $3) RETURNING file_id",
            [originalname, mimetype, buffer]
        );

        res.json({ file_id: newFile.rows[0].file_id });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).send("File upload failed");
    }
};

// GET /api/files/:id
export const serveFile = async (req, res) => {
    try {
        const { id } = req.params;
        const file = await pool.query("SELECT * FROM files WHERE file_id = $1", [id]);

        if (file.rows.length === 0) return res.status(404).send("File not found");

        const { mime_type, data, filename } = file.rows[0];
        res.setHeader('Content-Type', mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.send(data);
    } catch (err) {
        console.error("File Serve Error:", err);
        res.status(500).send("Error serving file");
    }
};

// GET /api/chats/available-students (For Instructors)
export const getAvailableStudents = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email,
                u.firebase_uid,
                CASE 
                    WHEN c.chat_id IS NOT NULL THEN c.chat_id
                    ELSE NULL
                END as existing_chat_id
            FROM users u
            LEFT JOIN chats c ON (
                (c.student_id = u.user_id AND c.instructor_id = $1)
            )
            WHERE u.role IN ('student', 'learner') 
            AND u.status = 'active'
            ORDER BY u.full_name ASC;
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error("GET /available-students Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
};

// GET /api/chats/available-instructors (For Students)
export const getAvailableInstructors = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email,
                u.firebase_uid,
                CASE 
                    WHEN c.chat_id IS NOT NULL THEN c.chat_id
                    ELSE NULL
                END as existing_chat_id
            FROM users u
            LEFT JOIN chats c ON (
                (c.instructor_id = u.user_id AND c.student_id = $1)
            )
            WHERE u.role IN ('instructor', 'company') 
            AND u.status = 'active'
            ORDER BY u.full_name ASC;
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error("GET /available-instructors Error:", err);
        res.status(500).json({ message: "Server Error", error: err.message });
    }
};