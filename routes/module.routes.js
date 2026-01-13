import express from "express";
import {
  addModules,
  getModulesByCourse,
  deleteModule,
} from "../controllers/moduleController.js";

import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();

router.post(
  "/modules",
  firebaseAuth,
  attachUser,
  roleGuard("instructor"),
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

export default router;
