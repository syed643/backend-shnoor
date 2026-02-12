import pool from "../db/postgres.js";
import csvParser from "csv-parser";
import { Readable } from "stream";

// Create a new challenge
export const createChallenge = async (req, res) => {
  try {
    const {
      title,
      description,
      type = "code",
      difficulty,
      starter_code,
      test_cases,
    } = req.body;

    if (!title || !description || !difficulty) {
      return res
        .status(400)
        .json({ message: "Title, description, and difficulty are required" });
    }

    // 🔥 Ensure every test case has isPublic
    const normalizedTestCases = (test_cases || []).map((tc) => ({
      input: tc.input,
      output: tc.output,
      isPublic: tc.isPublic === true, // default false if not provided
    }));

    const result = await pool.query(
      `INSERT INTO practice_challenges 
            (title, description, type, difficulty, starter_code, test_cases) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *`,
      [
        title,
        description,
        type,
        difficulty,
        starter_code,
        JSON.stringify(normalizedTestCases),
      ],
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
    await pool.query(
      "DELETE FROM practice_challenges WHERE challenge_id = $1",
      [id],
    );
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
    const result = await pool.query(
      "SELECT * FROM practice_challenges ORDER BY difficulty ASC",
    );
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
    const result = await pool.query(
      "SELECT * FROM practice_challenges WHERE challenge_id = $1",
      [id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Challenge not found" });
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
    ('Two Sum', 'Given an array...', 'code', 'Easy', 'function twoSum(nums, target) {\n\n}', 
    '[{"input": "([2, 7, 11, 15], 9)", "output": "[0, 1]", "isPublic": true},
      {"input": "([3, 2, 4], 6)", "output": "[1, 2]", "isPublic": false}]'),

    ('Reverse String', 'Write a function...', 'code', 'Easy', 'function reverseString(s) {\n\n}', 
    '[{"input": "(\\"hello\\")", "output": "\\"olleh\\"", "isPublic": true}]')
`);
    }
    console.log("✅ Practice schema verified");
  } catch (err) {
    console.error("❌ Practice schema check failed", err);
  }
};

export const bulkUploadChallenges = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const results = [];
        const errors = [];
        let rowNumber = 0;

        // Parse CSV from buffer
        const stream = Readable.from(req.file.buffer.toString());

        stream
            .pipe(csvParser())
            .on("data", (row) => {
                rowNumber++;
                try {
                    // Validate required fields
                    if (!row.title || !row.description || !row.difficulty) {
                        errors.push({
                            row: rowNumber,
                            data: row,
                            error: "Missing required fields (title, description, or difficulty)",
                        });
                        return;
                    }

                    // Validate difficulty
                    const validDifficulties = ["Easy", "Medium", "Hard"];
                    if (!validDifficulties.includes(row.difficulty)) {
                        errors.push({
                            row: rowNumber,
                            data: row,
                            error: `Invalid difficulty. Must be one of: ${validDifficulties.join(", ")}`,
                        });
                        return;
                    }

                    // Parse test_cases JSON
                    let testCases = [];
                    if (row.test_cases) {
                        try {
                            testCases = JSON.parse(row.test_cases);

                            // Validate test case structure
                            if (!Array.isArray(testCases)) {
                                throw new Error("test_cases must be an array");
                            }

                            // Ensure each test case has required fields
                            testCases = testCases.map((tc) => ({
                                input: tc.input || "",
                                output: tc.output || "",
                                isPublic: tc.isPublic === true || tc.isPublic === "true",
                            }));
                        } catch (e) {
                            errors.push({
                                row: rowNumber,
                                data: row,
                                error: `Invalid test_cases JSON: ${e.message}`,
                            });
                            return;
                        }
                    }

                    // Add to results for bulk insert
                    results.push({
                        title: row.title.trim(),
                        description: row.description.trim(),
                        type: row.type || "code",
                        difficulty: row.difficulty.trim(),
                        starter_code: row.starter_code || "",
                        test_cases: testCases,
                    });
                } catch (err) {
                    errors.push({
                        row: rowNumber,
                        data: row,
                        error: err.message,
                    });
                }
            })
            .on("end", async () => {
                try {
                    // Bulk insert valid challenges
                    const insertedChallenges = [];

                    for (const challenge of results) {
                        const result = await pool.query(
                            `INSERT INTO practice_challenges 
               (title, description, type, difficulty, starter_code, test_cases) 
               VALUES ($1, $2, $3, $4, $5, $6) 
               RETURNING *`,
                            [
                                challenge.title,
                                challenge.description,
                                challenge.type,
                                challenge.difficulty,
                                challenge.starter_code,
                                JSON.stringify(challenge.test_cases),
                            ]
                        );
                        insertedChallenges.push(result.rows[0]);
                    }

                    res.status(200).json({
                        message: "CSV upload completed",
                        summary: {
                            total: rowNumber,
                            successful: insertedChallenges.length,
                            failed: errors.length,
                        },
                        insertedChallenges,
                        errors: errors.length > 0 ? errors : undefined,
                    });
                } catch (dbError) {
                    console.error("Database insertion error:", dbError);
                    res.status(500).json({
                        message: "Database error during bulk insert",
                        error: dbError.message,
                        partialResults: {
                            parsed: results.length,
                            errors: errors.length,
                        },
                    });
                }
            })
            .on("error", (err) => {
                console.error("CSV parsing error:", err);
                res.status(500).json({
                    message: "Failed to parse CSV file",
                    error: err.message,
                });
            });
    } catch (err) {
        console.error("Bulk upload error:", err);
        res.status(500).json({
            message: "Server error during upload",
            error: err.message,
        });
    }
};
