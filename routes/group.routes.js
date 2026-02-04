import express from "express";
import { createGroup, getGroups, getGroup, getGroupUsers, addUserToGroup, removeUserFromGroup, updateGroup, deleteGroup } from "../controllers/group.controller.js";
import firebaseAuth from "../middlewares/firebaseAuth.js";
import attachUser from "../middlewares/attachUser.js";
import roleGuard from "../middlewares/roleGuard.js";

const router = express.Router();

// All admin-protected
router.post("/", firebaseAuth, attachUser, roleGuard("admin"), createGroup);
router.get("/", firebaseAuth, attachUser, roleGuard("admin"), getGroups);
router.get("/:groupId", firebaseAuth, attachUser, roleGuard("admin"), getGroup);
router.put("/:groupId", firebaseAuth, attachUser, roleGuard("admin"), updateGroup);
router.delete("/:groupId", firebaseAuth, attachUser, roleGuard("admin"), deleteGroup);
router.get("/:groupId/users", firebaseAuth, attachUser, roleGuard("admin"), getGroupUsers);
router.post("/:groupId/users/:userId", firebaseAuth, attachUser, roleGuard("admin"), addUserToGroup);
router.delete("/:groupId/users/:userId", firebaseAuth, attachUser, roleGuard("admin"), removeUserFromGroup);

export default router;
