const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  initializePayment,
  verifyPayment,
  getSubscriptionStatus,
  checkPageAccess
} = require('../controllers/subscription.controller');

// Main subscription routes for status and access checks
router.post('/initialize', protect, initializePayment);
router.get('/status', protect, getSubscriptionStatus);
router.get('/check-access', protect, checkPageAccess);

module.exports = router; 