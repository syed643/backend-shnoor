import express from "express";
import {
  getMyProfile,
  getAllUsers,
  addInstructor,
  updateUserStatus,
  updateMyProfile,
  uploadProfilePicture,
} from "../controllers/user.controller.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/profile_pictures";
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

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

router.post(
  "/upload-profile-picture",
  firebaseAuth,
  attachUser,
  upload.single("file"),
  uploadProfilePicture
);
export default router;
