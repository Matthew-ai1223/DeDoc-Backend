const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');
const Payment = require('../models/Payment');
const paymentController = require('../controllers/payment.controller');

// Initialize payment
router.post('/initialize', authenticateToken, paymentController.initializePayment);

// Verify payment
router.get('/verify', authenticateToken, paymentController.verifyPayment);

// Get subscription status
router.get('/status', authenticateToken, subscriptionController.getSubscriptionStatus);

// Helper function to get duration in milliseconds based on plan
function getDurationInMs(plan) {
    const durations = {
        'basic': 2 * 60 * 60 * 1000, // 2 hours
        'standard': 7 * 24 * 60 * 60 * 1000, // 1 week
        'premium': 14 * 24 * 60 * 60 * 1000, // 2 weeks
        'pro': 30 * 24 * 60 * 60 * 1000 // 1 month
    };
    return durations[plan] || 0;
}

// Get payment details
router.get('/details', authenticateToken, paymentController.getPaymentDetails);

module.exports = router; 