import express from "express";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

import { addMcqQuestion } from "../controllers/exams/examQuestion.controller.js";
import { addCodingQuestion } from "../controllers/exams/examcoding.controller.js";
import { submitExam } from "../controllers/exams/examSubmission.controller.js";

import {
  getExamSubmissions,
  evaluateDescriptiveAnswer,
  evaluateCodingAnswer,
  finalizeExamResult
} from "../controllers/exams/examevaluation.controller.js";

import {
  getMyExamResults,
  getMyExamResultByExam,
  getExamResultsForInstructor
} from "../controllers/exams/examresult.controller.js";

import {
  createExam,
  getInstructorExams,
  getAllExamsForStudents
} from "../controllers/exams/exam.controller.js";

import { addDescriptiveQuestion } from "../controllers/exams/examdescriptive.controller.js";

const router = express.Router();

/* ========== INSTRUCTOR: ADD QUESTIONS ========== */
router.post(
  "/:examId/questions/mcq",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  addMcqQuestion
);

router.post(
  "/:examId/questions/coding",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  addCodingQuestion
);

router.post(
  "/:examId/questions/descriptive",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  addDescriptiveQuestion
);

/* ========== STUDENT: SUBMIT EXAM ========== */
router.post(
  "/:examId/submit",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  submitExam
);

/* ========== INSTRUCTOR: EVALUATION ========== */
router.get(
  "/:examId/submissions",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getExamSubmissions
);

router.put(
  "/answers/:answerId/evaluate",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  evaluateDescriptiveAnswer
);

router.put(
  "/answers/:answerId/evaluate-coding",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  evaluateCodingAnswer
);

router.post(
  "/:examId/students/:studentId/finalize",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  finalizeExamResult
);

/* ========== RESULTS ========== */
router.get(
  "/results/my",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  getMyExamResults
);

router.get(
  "/results/:examId",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  getMyExamResultByExam
);

router.get(
  "/:examId/results",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getExamResultsForInstructor
);

router.post(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  createExam
);

// Instructor fetches their exams
router.get(
  "/instructor",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getInstructorExams
);

// Students fetch available exams
router.get(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner"),
  getAllExamsForStudents
);
export default router;
