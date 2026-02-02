import pool from "../db/postgres.js";

// Create a new challenge
export const createChallenge = async (req, res) => {
    try {
        const { title, description, type = 'code', difficulty, starter_code, test_cases } = req.body;

        // Basic validation
        if (!title || !description || !difficulty) {
            return res.status(400).json({ message: "Title, description, and difficulty are required" });
        }

        const result = await pool.query(
            `INSERT INTO practice_challenges 
            (title, description, type, difficulty, starter_code, test_cases) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
            [title, description, type, difficulty, starter_code, JSON.stringify(test_cases)]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Create Challenge Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// Delete a challenge
export const deleteChallenge = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM practice_challenges WHERE challenge_id = $1", [id]);
        res.json({ message: "Challenge deleted successfully" });
    } catch (err) {
        console.error("Delete Challenge Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get all challenges
export const getChallenges = async (req, res) => {
    try {
        // Assume we have a practice_challenges table. If not, I will create it.
        const result = await pool.query("SELECT * FROM practice_challenges ORDER BY difficulty ASC");
        res.json(result.rows);
    } catch (err) {
        // If table doesn't exist, return empty or mock for now to prevent crash until schema runs
        console.error("Get Challenges Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// Get single challenge
export const getChallengeById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM practice_challenges WHERE challenge_id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Challenge not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Get Challenge Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
};

// Verify Schema Helper (to run on startup)
export const verifyPracticeSchema = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS practice_challenges (
                challenge_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'code', -- Added missing column
                difficulty VARCHAR(50) CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
                starter_code TEXT,
                test_cases JSONB, -- Array of {input, output}
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Check if empty, seed it
        const check = await pool.query("SELECT COUNT(*) FROM practice_challenges");
        if (parseInt(check.rows[0].count) === 0) {
            console.log("🌱 Seeding Practice Challenges...");
            await pool.query(`
                INSERT INTO practice_challenges (title, description, type, difficulty, starter_code, test_cases) VALUES 
                ('Two Sum', 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.', 'code', 'Easy', 'function twoSum(nums, target) {\n\n}', '[{"input": "([2, 7, 11, 15], 9)", "output": "[0, 1]"}, {"input": "([3, 2, 4], 6)", "output": "[1, 2]"}]'),
                ('Reverse String', 'Write a function that reverses a string.', 'code', 'Easy', 'function reverseString(s) {\n\n}', '[{"input": "(\\"hello\\")", "output": "\\"olleh\\""}]')
            `);
        }
        console.log("✅ Practice schema verified");
    } catch (err) {
        console.error("❌ Practice schema check failed", err);
    }
};
