import express from "express";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

import {
  getChallenges,
  getChallengeById,
  createChallenge,
  deleteChallenge,
  bulkUploadChallenges,
} from "../controllers/practice.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
// 🔐 Step 1: verify firebase token
router.use(firebaseAuth);

// 🔥 Step 2: load DB user into req.user
router.use(attachUser);

// 📖 All authenticated users
router.get("/", getChallenges);
router.get("/:id", getChallengeById);

// ✍️ Only instructor & admin
router.post("/", roleGuard("instructor", "admin"), createChallenge);
router.delete("/:id", roleGuard("instructor", "admin"), deleteChallenge);
router.post(
  "/bulk-upload",
  roleGuard("instructor", "admin"),
  upload.single("csvFile"),
  bulkUploadChallenges
);
export default router;
