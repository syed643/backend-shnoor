import express from "express";
import {
  addModules,
  getModulesByCourse,
  deleteModule,
  getModulePdf,
  getModuleStream,
  advanceModuleStream
} from "../controllers/moduleController.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import uploadPdf from "../middlewares/uploadPdf.js";
import { uploadBulk } from "../middlewares/uploadBulk.js";
import { bulkUploadModules } from "../controllers/modulebulk.controller.js";

const router = express.Router();

router.post(
  "/modules",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  uploadPdf.array("pdfs"),
  addModules
);

router.get(
  "/courses/:courseId/modules",
  firebaseAuth,
  attachUser,
  getModulesByCourse
);

router.delete(
  "/:moduleId",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  deleteModule
);

router.get(
  "/modules/:moduleId/pdf",
  firebaseAuth,
  getModulePdf
);

router.get(
  "/modules/:moduleId/stream",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner", "instructor"),
  getModuleStream
);

router.post(
  "/modules/:moduleId/stream/next",
  firebaseAuth,
  attachUser,
  roleGuard("student", "learner", "instructor"),
  advanceModuleStream
);

router.post(
  "/modules/bulk-upload",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
  uploadBulk,
  bulkUploadModules
);
export default router;
