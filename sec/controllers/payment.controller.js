const Payment = require('../models/Payment');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Get payment details
exports.getPaymentDetails = async (req, res) => {
    try {
        const { reference } = req.query;
        
        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment reference is required'
            });
        }

        console.log('Getting payment details for reference:', reference);
        console.log('User ID from token:', req.user.id);

        const payment = await Payment.findOne({ reference });
        console.log('Found payment:', payment ? 'Yes' : 'No');

        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found'
            });
        }

        // Verify payment belongs to user
        if (payment.userId.toString() !== req.user.id) {
            console.log('Payment user ID:', payment.userId.toString());
            console.log('Token user ID:', req.user.id);
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access to payment'
            });
        }

        res.json({
            status: 'success',
            data: payment
        });
    } catch (error) {
        console.error('Get Payment Details Error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Error getting payment details'
        });
    }
};

// Verify payment
exports.verifyPayment = async (req, res) => {
    try {
        const { reference } = req.query;
        
        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment reference is required'
            });
        }

        console.log('Verifying payment for reference:', reference);
        console.log('User ID from token:', req.user.id);

        const payment = await Payment.findOne({ reference });
        console.log('Found payment:', payment ? 'Yes' : 'No');

        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment not found'
            });
        }

        // Verify payment belongs to user
        if (payment.userId.toString() !== req.user.id) {
            console.log('Payment user ID:', payment.userId.toString());
            console.log('Token user ID:', req.user.id);
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access to payment'
            });
        }

        // Check if payment is already verified
        if (payment.status === 'success' && payment.verified) {
            return res.json({
                status: 'success',
                message: 'Payment already verified',
                data: {
                    payment: {
                        reference: payment.reference,
                        amount: payment.amount,
                        plan: payment.plan,
                        status: payment.status
                    }
                }
            });
        }

        console.log('Verifying with Paystack...');
        // Verify with Paystack
        const response = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            }
        );

        console.log('Paystack response:', response.data);
        const paystackData = response.data.data;

        if (paystackData.status !== 'success') {
            return res.status(400).json({
                status: 'error',
                message: 'Payment verification failed with Paystack'
            });
        }

        // Update payment status
        payment.status = 'success';
        payment.verified = true;
        payment.verificationDate = new Date();
        await payment.save();
        console.log('Payment status updated');

        // Update user subscription
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Calculate subscription dates
        const startDate = new Date();
        const endDate = payment.calculateSubscriptionEnd();

        // Update user subscription
        user.subscription = {
            plan: payment.plan,
            startDate: startDate,
            endDate: endDate,
            status: 'active'
        };
        await user.save();
        console.log('User subscription updated');

        res.json({
            status: 'success',
            message: 'Payment verified successfully',
            data: {
                payment: {
                    reference: payment.reference,
                    amount: payment.amount,
                    plan: payment.plan,
                    status: payment.status
                },
                subscription: {
                    plan: user.subscription.plan,
                    startDate: user.subscription.startDate,
                    endDate: user.subscription.endDate,
                    status: user.subscription.status
                }
            }
        });
    } catch (error) {
        console.error('Payment Verification Error:', error);
        
        // Handle specific error types
        if (error.response) {
            // Paystack API error
            console.error('Paystack API Error:', error.response.data);
            return res.status(error.response.status).json({
                status: 'error',
                message: 'Payment verification failed with Paystack',
                details: error.response.data
            });
        }

        res.status(500).json({
            status: 'error',
            message: error.message || 'Error verifying payment'
        });
    }
}; 