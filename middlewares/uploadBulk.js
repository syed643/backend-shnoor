import multer from "multer";
import path from "path";
import fs from "fs";

// Reuse the upload directory logic
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = "uploads/";
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const fileFilter = (req, file, cb) => {
    // Allow CSV
    if (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || path.extname(file.originalname).toLowerCase() === ".csv") {
        return cb(null, true);
    }

    // Allow other resource types (Video, PDF, Text)
    const allowedTypes = [
        "video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo", "video/ogg",
        "application/pdf",
        "text/plain", "text/html"
    ];
    const allowedExts = [
        ".mp4", ".mkv", ".webm", ".mov", ".avi", ".ogg",
        ".pdf",
        ".txt", ".html"
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
        return cb(null, true);
    }

    cb(new Error(`Invalid file type: ${file.originalname}`), false);
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// Expecting 'file' (CSV) and 'resources' (Multiple files)
export const uploadBulk = upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'resources', maxCount: 20 }
]);