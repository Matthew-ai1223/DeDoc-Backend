const User = require('../models/User');
const https = require('https');

const SUBSCRIPTION_PLANS = {
  basic: {
    amount: 5000, // 50 naira in kobo
    duration: 60 * 60 * 1000, // 1 hour in milliseconds
    name: 'Basic Plan'
  },
  standard: {
    amount: 45000, // 450 naira in kobo
    duration: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
    name: 'Standard Plan'
  },
  premium: {
    amount: 85000, // 850 naira in kobo
    duration: 14 * 24 * 60 * 60 * 1000, // 2 weeks in milliseconds
    name: 'Premium Plan'
  },
  pro: {
    amount: 160000, // 1,600 naira in kobo
    duration: 30 * 24 * 60 * 60 * 1000, // 1 month in milliseconds
    name: 'Pro Plan'
  }
};

// Initialize payment
exports.initializePayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findById(req.user.id);

    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    const params = JSON.stringify({
      email: user.email,
      amount: SUBSCRIPTION_PLANS[plan].amount,
      callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
      metadata: {
        userId: user._id.toString(),
        plan
      }
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paymentReq = https.request(options, paymentRes => {
      let data = '';

      paymentRes.on('data', (chunk) => {
        data += chunk;
      });

      paymentRes.on('end', () => {
        res.json(JSON.parse(data));
      });
    }).on('error', (error) => {
      console.error('Payment initialization error:', error);
      res.status(500).json({ message: 'Payment initialization failed' });
    });

    paymentReq.write(params);
    paymentReq.end();
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ message: 'Payment process failed' });
  }
};

// Verify payment and activate subscription
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment reference is required'
      });
    }

    const Paystack = require('@paystack/paystack-sdk');
    const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

    try {
      const verificationResponse = await paystack.transaction.verify(reference);
      console.log('Paystack verification response:', verificationResponse);

      if (verificationResponse && verificationResponse.data && verificationResponse.data.status === 'success') {
        const metadata = verificationResponse.data.metadata;

        // Validate metadata
        if (!metadata || !metadata.userId || !metadata.plan) {
          console.error('Invalid metadata in verification response:', metadata);
          return res.status(400).json({
            status: 'error',
            message: 'Invalid payment metadata',
            reference: reference
          });
        }

        const { userId, plan } = metadata;
        const user = await User.findById(userId);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
            reference: reference
          });
        }

        try {
          const now = new Date();
          user.subscription = {
            status: 'active',
            plan: plan,
            startDate: now,
            endDate: new Date(now.getTime() + SUBSCRIPTION_PLANS[plan].duration),
            lastPaymentDate: now,
            reference: reference
          };

          await user.save();

          return res.json({
            status: 'success',
            message: 'Subscription activated successfully',
            data: {
              subscription: user.subscription,
              reference: reference
            }
          });
        } catch (dbError) {
          console.error('Database update error:', dbError);
          return res.status(500).json({
            status: 'error',
            message: 'Payment verified but subscription update failed',
            reference: reference
          });
        }
      } else {
        console.error('Invalid verification response:', verificationResponse);
        return res.status(400).json({
          status: 'error',
          message: 'Payment verification failed - Invalid response from payment provider',
          reference: reference
        });
      }
    } catch (paystackError) {
      console.error('Paystack verification error:', paystackError);
      return res.status(500).json({
        status: 'error',
        message: 'Error verifying payment with provider',
        reference: reference
      });
    }
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Payment verification failed',
      reference: reference
    });
  }
};

// Get subscription status
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if subscription has expired
    if (user.subscription.endDate && new Date() > user.subscription.endDate) {
      user.subscription = {
        plan: 'none',
        startDate: null,
        endDate: null
      };
      await user.save();
    }

    res.json({ subscription: user.subscription });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({ message: 'Failed to get subscription status' });
  }
};

// Get subscription
exports.getSubscription = async function(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        return user.subscription || { status: 'inactive', plan: null };
    } catch (error) {
        console.error('Error getting subscription:', error);
        throw error;
    }
}

// Update subscription
exports.updateSubscription = async function(userId, subscriptionData) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.subscription = {
            ...user.subscription,
            ...subscriptionData
        };

        await user.save();
        return user.subscription;
    } catch (error) {
        console.error('Error updating subscription:', error);
        throw error;
    }
} 