const Payment = require('../models/Payment');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Function to check and clear expired pending payments
async function clearExpiredPendingPayments(userId) {
    const EXPIRY_TIME = 3 * 1000; // 3 seconds in milliseconds
    const expiryTime = new Date(Date.now() - EXPIRY_TIME);

    console.log('Clearing expired payments for user:', userId);
    console.log('Expiry time:', expiryTime);

    // First, find all pending payments
    const pendingPayments = await Payment.find({
        userId,
        status: 'pending'
    });
    console.log('Found pending payments:', pendingPayments);

    // Update expired payments
    const result = await Payment.updateMany(
        {
            userId,
            status: 'pending',
            createdAt: { $lt: expiryTime }
        },
        {
            $set: { status: 'failed' }
        }
    );
    console.log('Update result:', result);

    // Verify the update
    const remainingPending = await Payment.find({
        userId,
        status: 'pending'
    });
    console.log('Remaining pending payments:', remainingPending);
}

// Initialize payment
exports.initializePayment = async (req, res) => {
    try {
        const { plan, email, fullName, phone } = req.body;
        
        console.log('Initializing payment for user:', req.user.id);
        console.log('Plan:', plan);
        
        // Clear any expired pending payments
        await clearExpiredPendingPayments(req.user.id);

        // Check for existing pending payment
        const existingPayment = await Payment.findOne({
            userId: req.user.id,
            status: 'pending'
        });

        console.log('Existing payment:', existingPayment);

        if (existingPayment) {
            // Check if the existing payment is for the same plan
            if (existingPayment.plan === plan) {
                console.log('Found pending payment for same plan');
                return res.status(400).json({
                    status: 'error',
                    message: 'You have a pending payment for this plan. Please complete or wait for it to expire.',
                    data: {
                        reference: existingPayment.reference,
                        createdAt: existingPayment.createdAt,
                        timeElapsed: Date.now() - existingPayment.createdAt.getTime()
                    }
                });
            } else {
                console.log('Found pending payment for different plan, marking as failed');
                // If it's a different plan, mark the old payment as failed
                existingPayment.status = 'failed';
                await existingPayment.save();
            }
        }

        // Initialize new payment with Paystack
        console.log('Initializing new payment with Paystack');
        const response = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email,
                amount: getPlanAmount(plan) * 100, // Convert to kobo
                callback_url: `${process.env.FRONTEND_URL}/payment-verification.html`,
                metadata: {
                    userId: req.user.id,
                    plan,
                    fullName,
                    phone
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Create payment record
        const payment = new Payment({
            userId: req.user.id,
            reference: response.data.data.reference,
            amount: getPlanAmount(plan),
            plan,
            status: 'pending',
            paymentResponse: response.data
        });

        await payment.save();
        console.log('New payment record created:', payment);

        res.json({
            status: 'success',
            message: 'Payment initialized successfully',
            data: response.data.data
        });
    } catch (error) {
        console.error('Payment initialization error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Payment initialization failed'
        });
    }
};

// Helper function to get plan amount
function getPlanAmount(plan) {
    const planAmounts = {
        basic: 50,
        standard: 450,
        premium: 850,
        pro: 1600,
        paygo: 350
    };
    return planAmounts[plan] || 0;
}

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
            // Get user to return subscription data
            const user = await User.findById(req.user.id);
            if (user && user.subscription) {
                return res.json({
                    status: 'success',
                    message: 'Payment already verified',
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
            }
            // If no user subscription found, continue with verification
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
        
        // Check if Paystack API call was successful
        if (!response.data.status || !response.data.data) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid response from Paystack',
                details: response.data
            });
        }
        
        const paystackData = response.data.data;

        // Check if the transaction was successful
        if (paystackData.status !== 'success') {
            return res.status(400).json({
                status: 'error',
                message: `Payment verification failed with Paystack. Status: ${paystackData.status}`,
                details: paystackData
            });
        }

        // Update payment status (this will trigger pre-save hook to calculate subscriptionEnd)
        payment.status = 'success';
        payment.verified = true;
        payment.verificationDate = new Date();
        // The pre-save hook will calculate subscriptionStart and subscriptionEnd when status changes to 'success'
        await payment.save();
        console.log('Payment status updated');
        
        // Ensure subscription dates are calculated (pre-save hook should handle this, but check anyway)
        if (!payment.subscriptionStart || !payment.subscriptionEnd) {
            payment.calculateSubscriptionEnd();
            await payment.save();
        }
        
        const startDate = payment.subscriptionStart || new Date();
        const endDate = payment.subscriptionEnd;

        // Update user subscription
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

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