import express from "express";
import {
  addModules,
  getModulesByCourse,
  deleteModule,
  getModulePdf
} from "../controllers/moduleController.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";
import uploadPdf from "../middlewares/uploadPdf.js";

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

export default router;
