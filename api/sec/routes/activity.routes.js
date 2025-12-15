const express = require('express');
const router = express.Router();
const { logActivity } = require('../controllers/activity.controller');

// Public endpoint to log activity
router.post('/log', logActivity);

module.exports = router;
