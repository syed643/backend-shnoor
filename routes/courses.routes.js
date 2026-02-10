import express from "express";
import {
  addCourse,
  approveCourse,
  getPendingCourses,
  getApprovedCourses,
  getInstructorCourses,
  deleteCourse,
  getApprovedCoursesForInstructor,
  getInstructorCourseStats,
  getCourseById,
  exploreCourses,
  bulkUploadCourses
} from "../controllers/course.controller.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import uploadCsv from "../middlewares/uploadCsv.js";

const router = express.Router();


router.post(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  addCourse
);

router.get(
  "/instructor",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getInstructorCourses
);

router.get(
  "/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingCourses
);

router.patch(
  "/:courseId/approve",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  approveCourse
);

router.get(
  "/approved",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getApprovedCourses
);

router.delete(
  "/:courseId",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  deleteCourse
);

router.get(
  "/instructor/approved",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getApprovedCoursesForInstructor
);

router.get(
  "/instructor/stats",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  getInstructorCourseStats
);

router.get(
  "/explore",
  firebaseAuth,
  attachUser,
  exploreCourses
);

router.get(
  "/:courseId",
  firebaseAuth,
  attachUser,
  getCourseById
);

router.post(
  "/bulk-upload",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  uploadCsv.single("file"),
  bulkUploadCourses
);

export default router;
