const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  initializePayment,
  verifyPayment,
  getSubscriptionStatus
} = require('../controllers/subscription.controller');

// Subscription routes
router.post('/initialize', protect, initializePayment);
router.get('/status', protect, getSubscriptionStatus);

module.exports = router; 