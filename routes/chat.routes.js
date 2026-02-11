import express from "express";
import multer from "multer";

import {
    getMyChats,
    getMessages,
    createChat,
    markRead,
    uploadFile,
    getAvailableStudents,
    getAvailableInstructors,
    createGroup,
    getMyGroups,
    getAvailableGroups,
    joinGroup,
    updateMeetingLink,
    stopMeeting,
    getGroupMessages,
    editMessage,
    deleteMessage,
    getGroupMembers,
    updateGroup,
    leaveGroup,
    deleteGroup,
    promoteToAdmin,
    removeMember,
    addReaction,
    removeReaction
} from "../controllers/chat.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.get("/", firebaseAuth, attachUser, roleGuard, getMyChats);
router.get("/messages/:chatId", firebaseAuth, attachUser, roleGuard, getMessages);
router.put("/messages/:messageId", firebaseAuth, attachUser, roleGuard, editMessage);
router.delete("/messages/:messageId", firebaseAuth, attachUser, roleGuard, deleteMessage);
router.get("/available-students", firebaseAuth, attachUser, roleGuard, getAvailableStudents);
router.get("/available-instructors", firebaseAuth, attachUser, roleGuard, getAvailableInstructors);
router.post("/", firebaseAuth, attachUser, roleGuard, createChat);
router.post("/upload", firebaseAuth, attachUser, roleGuard, upload.single('file'), uploadFile);
router.put("/read", firebaseAuth, attachUser, roleGuard, markRead);

// Groups
router.post("/groups", firebaseAuth, attachUser, roleGuard, createGroup);
router.get("/groups/my", firebaseAuth, attachUser, roleGuard, getMyGroups);
router.get("/groups/available", firebaseAuth, attachUser, roleGuard, getAvailableGroups);
router.post("/groups/:groupId/join", firebaseAuth, attachUser, roleGuard, joinGroup);
router.put("/groups/:groupId/meeting", firebaseAuth, attachUser, roleGuard, updateMeetingLink);
router.delete("/groups/:groupId/meeting", firebaseAuth, attachUser, roleGuard, stopMeeting);
router.get("/groups/:groupId/messages", firebaseAuth, attachUser, roleGuard, getGroupMessages);
router.get("/groups/:groupId/members", firebaseAuth, attachUser, roleGuard, getGroupMembers);
router.put("/groups/:groupId", firebaseAuth, attachUser, roleGuard, updateGroup);
router.post("/groups/:groupId/leave", firebaseAuth, attachUser, roleGuard, leaveGroup);
router.delete("/groups/:groupId", firebaseAuth, attachUser, roleGuard, deleteGroup);
router.put("/groups/:groupId/promote/:userId", firebaseAuth, attachUser, roleGuard, promoteToAdmin);
router.delete("/groups/:groupId/members/:userId", firebaseAuth, attachUser, roleGuard, removeMember);

// Reactions
router.post("/messages/:messageId/react", firebaseAuth, attachUser, roleGuard, addReaction);
router.delete("/messages/:messageId/react", firebaseAuth, attachUser, roleGuard, removeReaction);

console.log("✅ Chat routes registered");

export default router;