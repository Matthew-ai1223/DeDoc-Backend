const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');
const Payment = require('../models/Payment');

// Initialize payment
router.post('/initialize', auth, async (req, res) => {
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

// Verify payment - use subscription controller but first update payment record
router.get('/verify', auth, async (req, res) => {
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment reference is required'
            });
        }

        // Find the payment record
        const payment = await Payment.findOne({ reference });
        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment record not found'
            });
        }

        // Check if payment was already verified
        if (payment.status === 'success') {
            return res.json({
                status: 'success',
                message: 'Payment was already verified',
                data: payment
            });
        }

        // Verify that the user making the request is the same user who initiated the payment
        if (payment.userId.toString() !== req.user.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized to verify this payment'
            });
        }

        try {
            const Paystack = require('@paystack/paystack-sdk');
            const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);
            const verificationResponse = await paystack.transaction.verify(reference);

            // Update payment record with response
            payment.paymentResponse = verificationResponse;
            
            if (verificationResponse.data.status === 'success') {
                payment.status = 'success';
                await payment.save();

                // Update subscription using the controller
                const subscriptionUpdate = await subscriptionController.updateSubscription(payment.userId, {
                    status: 'active',
                    plan: payment.plan,
                    lastPaymentDate: new Date(),
                    nextPaymentDue: new Date(Date.now() + getDurationInMs(payment.plan))
                });

                return res.json({
                    status: 'success',
                    message: 'Payment verified and subscription updated successfully',
                    data: {
                        payment,
                        subscription: subscriptionUpdate
                    }
                });
            } else {
                payment.status = 'failed';
                await payment.save();

                return res.status(400).json({
                    status: 'error',
                    message: 'Payment verification failed',
                    data: payment
                });
            }
        } catch (error) {
            console.error('Paystack verification error:', error);
            payment.status = 'failed';
            payment.paymentResponse = { error: error.message };
            await payment.save();

            return res.status(400).json({
                status: 'error',
                message: 'Payment verification failed with Paystack',
                error: error.message
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Error verifying payment',
            error: error.message,
            reference: req.query.reference
        });
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