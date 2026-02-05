import multer from "multer";
import path from "path";
import fs from "fs";

const baseUrl = process.env.BACKEND_URL;

// Configure storage
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

// File filter (Video & PDF)
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        // Common video types
        "video/mp4",
        "video/webm",
        "video/quicktime", // .mov
        "video/x-matroska", // .mkv (common browser/OS mime)
        "video/x-msvideo", // .avi
        "video/ogg",
        // PDFs
        "application/pdf",
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExts = [
        ".mp4",
        ".mkv",
        ".webm",
        ".mov",
        ".avi",
        ".ogg",
        ".pdf",
    ];

    const isAllowedMime = allowedTypes.includes(file.mimetype);
    const isAllowedByExt =
        file.mimetype === "application/octet-stream" &&
        allowedExts.includes(ext);

    console.log(`[Upload Debug] Filename: ${file.originalname}, Mimetype: ${file.mimetype}, Ext: ${ext}`);

    if (isAllowedMime || isAllowedByExt) {
        cb(null, true);
    } else {
        console.error(`[Upload Debug] Rejected file: ${file.originalname} (${file.mimetype})`);
        cb(
            new Error(
                `Invalid file type (${file.mimetype}). Only common video formats (MP4, MKV, WebM, MOV, AVI) and PDF are allowed.`
            ),
            false
        );
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

export const uploadFile = upload.single("file");

export const handleUpload = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.status(200).json({
        message: "File uploaded successfully",
        url: fileUrl,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
    });
};
