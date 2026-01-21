import express from "express";
import {
  getDashboardStats,
  getAllStudents,
  assignCourses,
  updateCourseStatus,
  getCoursesByStatus,
  approveUser,
  getPendingUsers,
  getPendingCourses,
  updateUserStatus
} from "../controllers/admin.controller.js";
import { getAllUsers } from "../controllers/user.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();

router.get(
  "/dashboard-stats",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getDashboardStats
);

router.get(
  "/students",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getAllStudents
);

router.post(
  "/assign-courses",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  assignCourses
);

router.get(
  "/courses",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getCoursesByStatus
);

router.get(
  "/courses/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingCourses
);

router.patch(
  "/courses/:courses_id/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateCourseStatus
);

router.patch(
  "/users/:userId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  approveUser
);

router.get(
  "/users/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingUsers
);

router.put(
  "/users/:userId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateUserStatus
);

router.get(
  "/users",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getAllUsers
);

export default router;


{/*router.get(
  "/courses/pending",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getPendingCourses
);
*/}
{/*router.get(
  "/courses/approved",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getApprovedCourses
);*/}

{/*router.post(
  "/courses/:courseId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateCourseStatus
);*/}