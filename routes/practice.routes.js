import express from "express";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import roleGuard from "../middlewares/roleGuard.js";
import attachUser from "../middlewares/attachUser.js";

import {
  getChallenges,
  getChallengeById,
  createChallenge,
  deleteChallenge,
} from "../controllers/practice.controller.js";

const router = express.Router();

// 🔐 All routes require authentication
router.use(firebaseAuth);

// 📖 Public to all authenticated users (students, instructors, admins)
router.get("/", getChallenges,attachUser);
router.get("/:id", getChallengeById,attachUser);

// ✍️ Only instructor & admin can modify
router.post("/", roleGuard("instructor", "admin"),attachUser,createChallenge);
router.delete("/:id", roleGuard("instructor", "admin"), attachUser,deleteChallenge);

export default router;
