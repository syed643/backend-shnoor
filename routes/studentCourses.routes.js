import express from "express";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import { getStudentCourseById } from "../controllers/studentCourses.controller.js";
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

export default router;
