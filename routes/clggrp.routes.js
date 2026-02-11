import express from 'express';
import {
    createGroup,
    joinGroup,
    updateMeeting,
    getMyGroups,
    getAvailableGroups,
    getGroupMessages
} from '../controllers/clggrp.controller.js';
import firebaseAuth from '../middlewares/firebaseAuth.js';
import attachUser from '../middlewares/attachUser.js';
import roleGuard from '../middlewares/roleGuard.js';

const router = express.Router();

router.post('/create', firebaseAuth, attachUser, roleGuard, createGroup);
router.post('/:groupId/join', firebaseAuth, attachUser, roleGuard, joinGroup);
router.put('/:groupId/meeting', firebaseAuth, attachUser, roleGuard, updateMeeting);
router.get('/my', firebaseAuth, attachUser, roleGuard, getMyGroups);
router.get('/available', firebaseAuth, attachUser, roleGuard, getAvailableGroups);
router.get('/:groupId/messages', firebaseAuth, attachUser, roleGuard, getGroupMessages);

export default router;