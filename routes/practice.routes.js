import express from "express";
import { getChallenges, getChallengeById } from "../controllers/practice.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";

const router = express.Router();

router.use(firebaseAuth);

router.get("/", getChallenges);
router.get("/:id", getChallengeById);

import roleGuard from "../middlewares/roleGuard.js";
import { createChallenge, deleteChallenge } from "../controllers/practice.controller.js";

router.post("/", roleGuard("instructor", "admin"), createChallenge);
router.delete("/:id", roleGuard("instructor", "admin"), deleteChallenge);

export default router;
