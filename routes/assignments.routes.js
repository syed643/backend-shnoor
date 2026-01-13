import express from "express";
import {
  assignCourseToStudent,
  unassignCourse,
  getMyCourses,
} from "../controllers/assignmentController.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();


router.post(
  "/assign",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  assignCourseToStudent
);


router.post(
  "/unassign",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  unassignCourse
);


router.get(
  "/my-courses",
  firebaseAuth,
  attachUser,
  roleGuard("student","user"),
  getMyCourses
);

export default router;
