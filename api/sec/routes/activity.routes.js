const express = require('express');
const router = express.Router();
const { logActivity, getActivities } = require('../controllers/activity.controller');

// Public endpoint to log activity
router.post('/log', logActivity);

// Admin endpoint to fetch recent activity
router.get('/', getActivities);

module.exports = router;
