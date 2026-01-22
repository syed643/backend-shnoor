import express from "express";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import { getStudentCourseById, enrollStudent, checkEnrollmentStatus, getMyCourses } from "../controllers/studentCourses.controller.js";
import { markModuleCompleted } from "../controllers/studentProgress.controller.js";
import { getStudentDashboard } from "../controllers/student.controller.js";

const router = express.Router();

router.get(
  "/courses/:courseId",
  firebaseAuth,
  attachUser,
  roleGuard("student", "user"),
  getStudentCourseById
);

router.post(
  "/courses/:courseId/progress",
  firebaseAuth,
  attachUser,
  roleGuard("student", "user"),
  markModuleCompleted
);

router.get(
  "/dashboard",
  firebaseAuth,
  attachUser,
  roleGuard("student"),
  getStudentDashboard
);

router.post(
  "/:courseId/enroll",
  firebaseAuth,
  attachUser,
  roleGuard("student", "user"),
  enrollStudent
);

router.get(
  "/:courseId/status",
  firebaseAuth,
  attachUser,
  roleGuard("student", "user"),
  checkEnrollmentStatus
);

router.get(
  "/my-courses",
  firebaseAuth,
  attachUser,
  roleGuard("student", "user"),
  getMyCourses
);

export default router;
