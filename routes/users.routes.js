import express from "express";
import {
  getMyProfile,
  getAllUsers,
  addInstructor,
  updateUserStatus,
  updateMyProfile,
} from "../controllers/user.controller.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();


router.get(
  "/me",
  firebaseAuth,
  attachUser,
  getMyProfile
);

router.get(
  "/",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  getAllUsers
);

router.post(
  "/instructors",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  addInstructor
);

router.patch(
  "/:userId/status",
  firebaseAuth,
  attachUser,
  roleGuard("admin"),
  updateUserStatus
);

router.put(
  "/me",
  firebaseAuth,
  attachUser,
  updateMyProfile
);

export default router;
