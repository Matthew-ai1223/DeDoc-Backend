const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');
const Payment = require('../models/Payment');
const paymentController = require('../controllers/payment.controller');

// Initialize payment
router.post('/initialize', authenticateToken, async (req, res) => {
    try {
        const { plan, email, fullName, phone } = req.body;
        const userId = req.user.id;

        // Check if there's a pending payment for this user
        const pendingPayment = await Payment.findOne({
            userId,
            status: 'pending',
            createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) } // Within last 30 minutes
        });

        if (pendingPayment) {
            return res.status(400).json({
                status: 'error',
                message: 'You have a pending payment. Please complete or wait for it to expire.'
            });
        }

        // Initialize payment with Paystack
        const Paystack = require('@paystack/paystack-sdk');
        const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);
        const amount = {
            'basic': 5000, // NGN 50
            'standard': 45000, // NGN 450
            'premium': 85000, // NGN 850
            'pro': 160000 // NGN 1,600
        }[plan];

        if (!amount) {
            return res.status(400).json({ message: 'Invalid plan selected' });
        }

        const reference = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const initializeResponse = await paystack.transaction.initialize({
            email,
            amount,
            reference,
            callback_url: `${process.env.FRONTEND_URL}/payment-verification.html`,
            metadata: {
                userId,
                plan,
                fullName,
                phone
            }
        });

        // Store payment information
        await Payment.create({
            userId,
            reference,
            amount,
            plan,
            status: 'pending',
            metadata: {
                email,
                fullName,
                phone
            }
        });

        res.json({
            status: true,
            message: 'Payment initialized',
            data: {
                authorization_url: initializeResponse.data.authorization_url,
                reference: reference
            }
        });
    } catch (error) {
        console.error('Payment initialization error:', error);
        res.status(500).json({ message: 'Error initializing payment' });
    }
});

// Verify payment
router.get('/verify', authenticateToken, (req, res) => paymentController.verifyPayment(req, res));

// Get subscription status
router.get('/status', authenticateToken, (req, res) => subscriptionController.getSubscriptionStatus(req, res));

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
router.get('/details', authenticateToken, (req, res) => paymentController.getPaymentDetails(req, res));

module.exports = router; 