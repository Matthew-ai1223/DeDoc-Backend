// DEPRECATED: Use /api/subscription/* endpoints instead of /api/subscription/verification/*
const express = require('express');
const router = express.Router();
const { verifySubscription, verifyPaymentAndUpdateSubscription, checkPageAccess } = require('../controllers/subscriptions.verification');
const authenticateToken = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get subscription status
router.get('/status', verifySubscription);

// Verify payment and update subscription
router.post('/verify-payment', verifyPaymentAndUpdateSubscription);

// Check page access
router.get('/check-access', checkPageAccess);

module.exports = router; 