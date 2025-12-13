const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');

// Verify subscription status
const verifySubscription = async (req, res) => {
    try {
        const userId = req.user.id; // From auth middleware

        // Get user's subscription
        const subscription = await Subscription.findOne({ userId })
            .sort({ createdAt: -1 })
            .populate('paymentId');

        if (!subscription) {
            return res.status(404).json({
                status: 'error',
                message: 'No subscription found'
            });
        }

        // Check if subscription is active
        const now = new Date();
        const isActive = subscription.status === 'active' && 
                        subscription.endDate > now;

        // Get payment details
        const payment = subscription.paymentId;
        
        return res.status(200).json({
            status: 'success',
            subscription: {
                plan: subscription.plan,
                status: isActive ? 'active' : 'inactive',
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                paymentReference: payment ? payment.reference : null,
                timeRemaining: isActive ? 
                    Math.floor((subscription.endDate - now) / (1000 * 60 * 60 * 24)) : 0
            }
        });
    } catch (error) {
        console.error('Subscription verification error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Error verifying subscription'
        });
    }
};

// Verify payment and update subscription
const verifyPaymentAndUpdateSubscription = async (req, res) => {
    try {
        const { reference } = req.body;
        const userId = req.user.id;

        // Find payment by reference
        const payment = await Payment.findOne({ 
            reference,
            userId,
            status: 'success'
        });

        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found or not successful'
            });
        }

        // Check if subscription already exists
        let subscription = await Subscription.findOne({ 
            userId,
            paymentId: payment._id
        });

        if (subscription) {
            return res.status(200).json({
                status: 'success',
                message: 'Subscription already verified',
                subscription
            });
        }

        // Create new subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

        subscription = new Subscription({
            userId,
            paymentId: payment._id,
            plan: payment.plan,
            startDate,
            endDate,
            status: 'active'
        });

        await subscription.save();

        // Update user's subscription status
        await User.findByIdAndUpdate(userId, {
            hasActiveSubscription: true,
            subscriptionEndDate: endDate
        });

        return res.status(200).json({
            status: 'success',
            message: 'Subscription verified and updated',
            subscription
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Error verifying payment and updating subscription'
        });
    }
};

// Check subscription access for specific page
const checkPageAccess = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page } = req.query;

        // Get user's active subscription
        const subscription = await Subscription.findOne({ 
            userId,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (!subscription) {
            return res.status(403).json({
                status: 'error',
                message: 'No active subscription found'
            });
        }

        // Define allowed pages for each plan
        const planAccess = {
            basic: ['dashboard', 'profile'],
            premium: ['dashboard', 'profile', 'ai_doc_dashboard', 'health_reports'],
            enterprise: ['dashboard', 'profile', 'ai_doc_dashboard', 'health_reports', 'emergency_support']
        };

        const allowedPages = planAccess[subscription.plan] || [];
        const hasAccess = allowedPages.includes(page);

        return res.status(200).json({
            status: 'success',
            subscription: {
                hasAccess,
                plan: subscription.plan,
                status: subscription.status,
                endDate: subscription.endDate
            }
        });
    } catch (error) {
        console.error('Page access check error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Error checking page access'
        });
    }
};

module.exports = {
    verifySubscription,
    verifyPaymentAndUpdateSubscription,
    checkPageAccess
};
