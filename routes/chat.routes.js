import express from "express";
import multer from "multer";

import {
    getMyChats,
    getMessages,
    createChat,
    markRead,
    uploadFile,
    getAvailableStudents,
    getAvailableInstructors
} from "../controllers/chat.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Protect
router.use(firebaseAuth);
router.use(attachUser);

router.get("/", getMyChats);
router.get("/messages/:chatId", getMessages);
router.get("/available-students", getAvailableStudents);
router.get("/available-instructors", getAvailableInstructors);
router.post("/", createChat);
router.post("/upload", upload.single('file'), uploadFile);
router.put("/read", markRead);

console.log("✅ Chat routes registered");

export default router;