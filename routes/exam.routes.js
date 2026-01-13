import express from "express";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

import {
  createExam,
  getInstructorExams,
  getAllExamsForStudents
} from "../controllers/exam.controller.js";

import {
  addExamQuestion,
  getExamQuestionsForStudent
} from "../controllers/examQuestion.controller.js";

const router = express.Router();

/* Instructor */
router.post(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  createExam
);

router.get(
  "/instructor",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getInstructorExams
);

router.post(
  "/:examId/questions",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  addExamQuestion
);

/* Students */
router.get(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  getAllExamsForStudents
);

router.get(
  "/:examId/questions",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  getExamQuestionsForStudent
);

export default router;
