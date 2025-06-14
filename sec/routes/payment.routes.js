const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');

// Initialize payment
router.post('/initialize', auth, async (req, res) => {
    try {
        const { plan, email, fullName, phone } = req.body;
        const userId = req.user.id;

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
router.get('/verify', async (req, res) => {
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({ message: 'Payment reference is required' });
        }

        const Paystack = require('@paystack/paystack-sdk');
        const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);
        const verificationResponse = await paystack.transaction.verify(reference);

        if (verificationResponse.data.status === 'success') {
            const metadata = verificationResponse.data.metadata;
            const userId = metadata.userId;
            const plan = metadata.plan;

            // Update user subscription in database
            await subscriptionController.updateSubscription(userId, {
                status: 'active',
                plan: plan,
                lastPaymentDate: new Date(),
                nextPaymentDue: new Date(Date.now() + getDurationInMs(plan))
            });

            res.redirect(`${process.env.FRONTEND_URL}/dashboard.html?payment=success`);
        } else {
            res.redirect(`${process.env.FRONTEND_URL}/payment.html?error=payment_failed`);
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/payment.html?error=verification_failed`);
    }
});

// Get subscription status
router.get('/status', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const subscription = await subscriptionController.getSubscription(userId);
        res.json({ subscription });
    } catch (error) {
        console.error('Error fetching subscription status:', error);
        res.status(500).json({ message: 'Error fetching subscription status' });
    }
});

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

module.exports = router; 