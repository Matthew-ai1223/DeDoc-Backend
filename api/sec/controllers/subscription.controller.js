const User = require('../models/User');
const https = require('https');
const Payment = require('../models/Payment');

const SUBSCRIPTION_PLANS = {
  basic: {
    amount: 5000, // 50 naira in kobo
    duration: 60 * 60 * 1000, // 1 hour in milliseconds
    name: 'Basic Plan',
    allowedPages: ['std.html', 'p_c.html']
  },
  standard: {
    amount: 45000, // 450 naira in kobo
    duration: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
    name: 'Standard Plan',
    allowedPages: ['std.html', 'p_c.html', 'therapist_alice.html']
  },
  premium: {
    amount: 85000, // 850 naira in kobo
    duration: 14 * 24 * 60 * 60 * 1000, // 2 weeks in milliseconds
    name: 'Premium Plan',
    allowedPages: ['std.html', 'p_c.html', 'therapist_alice.html', 'doc_John.html', 'ai_doc_dashboard.html', 'health_reports.html']
  },
  pro: {
    amount: 160000, // 1,600 naira in kobo
    duration: 30 * 24 * 60 * 60 * 1000, // 1 month in milliseconds
    name: 'Pro Plan',
    allowedPages: ['std.html', 'p_c.html', 'therapist_alice.html', 'doc_John.html', 'ai_doc_dashboard.html', 'health_reports.html', 'emergency_support.html']
  }
};

// Validate subscription data
function validateSubscriptionData(subscription) {
  if (!subscription) return false;
  if (!subscription.plan || !SUBSCRIPTION_PLANS[subscription.plan]) return false;
  if (!subscription.startDate || !subscription.endDate) return false;
  
  const startDate = new Date(subscription.startDate);
  const endDate = new Date(subscription.endDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
  if (endDate <= startDate) return false;
  
  return true;
}

// Initialize payment
exports.initializePayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!SUBSCRIPTION_PLANS[plan]) {
      return res.status(400).json({ message: 'Invalid subscription plan' });
    }

    // Check if user already has an active subscription
    if (user.subscription && user.subscription.plan !== 'none') {
      const now = new Date();
      const endDate = new Date(user.subscription.endDate);
      
      if (endDate > now) {
        return res.status(400).json({ 
          message: 'You already have an active subscription',
          currentPlan: user.subscription.plan,
          endDate: user.subscription.endDate
        });
      }
    }

    const params = JSON.stringify({
      email: user.email,
      amount: SUBSCRIPTION_PLANS[plan].amount,
      callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
      metadata: {
        userId: user._id.toString(),
        plan,
        timestamp: Date.now()
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
        try {
          const response = JSON.parse(data);
          if (!response.status) {
            throw new Error('Invalid response from payment provider');
          }
          res.json(response);
        } catch (error) {
          console.error('Payment response parsing error:', error);
          res.status(500).json({ message: 'Error processing payment response' });
        }
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

      if (!verificationResponse?.data?.status === 'success') {
        return res.status(400).json({
          status: 'error',
          message: 'Payment verification failed',
          reference: reference
        });
      }

      const metadata = verificationResponse.data.metadata;
      if (!metadata?.userId || !metadata?.plan) {
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

      // Check if payment was already processed
      if (user.subscription?.reference === reference) {
        return res.json({
          status: 'success',
          message: 'Payment already processed',
          data: {
            subscription: user.subscription,
            reference: reference
          }
        });
      }

      const now = new Date();
      const planDetails = SUBSCRIPTION_PLANS[plan];
      
      if (!planDetails) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid subscription plan',
          reference: reference
        });
      }

      // Calculate subscription end date
      const endDate = new Date(now.getTime() + planDetails.duration);

      user.subscription = {
        plan: plan,
        startDate: now,
        endDate: endDate,
        lastPaymentDate: now,
        reference: reference,
        status: 'active'
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

// Get subscription status using Payment collection
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[SubscriptionStatus] userId:', userId);

    // Find the latest successful payment for this user
    const payment = await Payment.findOne({
      userId: userId,
      status: 'success'
    }).sort({ subscriptionEnd: -1 });

    console.log('[SubscriptionStatus] Found payment:', payment);

    if (!payment) {
      console.log('[SubscriptionStatus] No successful payment found for user');
      return res.json({
        status: 'success',
        subscription: {
          status: 'inactive',
          plan: 'none',
          subscriptionStart: null,
          subscriptionEnd: null,
          allowedPages: []
        }
      });
    }

    const now = new Date();
    const endDate = new Date(payment.subscriptionEnd);
    console.log('[SubscriptionStatus] Now:', now, 'EndDate:', endDate);

    if (endDate < now) {
      console.log('[SubscriptionStatus] Subscription expired');
      return res.json({
        status: 'success',
        subscription: {
          status: 'expired',
          plan: payment.plan,
          subscriptionStart: payment.subscriptionStart,
          subscriptionEnd: payment.subscriptionEnd,
          allowedPages: []
        }
      });
    }

    // Get allowed pages for the current plan
    const allowedPages = SUBSCRIPTION_PLANS[payment.plan]?.allowedPages || [];
    console.log('[SubscriptionStatus] Subscription active, allowedPages:', allowedPages);

    // Calculate time remaining
    const timeLeft = endDate - now;
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    return res.json({
      status: 'success',
      subscription: {
        status: 'active',
        plan: payment.plan,
        subscriptionStart: payment.subscriptionStart,
        subscriptionEnd: payment.subscriptionEnd,
        allowedPages,
        timeRemaining: { days, hours, minutes }
      }
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get subscription status'
    });
  }
};

// Check page access permission
exports.checkPageAccess = async (req, res) => {
  try {
    const { page } = req.query;
    if (!page) {
      return res.status(400).json({
        status: 'error',
        message: 'Page parameter is required'
      });
    }

    const userId = req.user.id;
    console.log('[PageAccess] Checking access for page:', page, 'userId:', userId);

    // Find the latest successful payment for this user
    const payment = await Payment.findOne({
      userId: userId,
      status: 'success'
    }).sort({ subscriptionEnd: -1 });

    if (!payment) {
      console.log('[PageAccess] No payment found for user');
      return res.json({
        status: 'success',
        hasAccess: false,
        message: 'No active subscription'
      });
    }

    const now = new Date();
    const endDate = new Date(payment.subscriptionEnd);

    // Check if subscription has expired
    if (endDate < now) {
      console.log('[PageAccess] Subscription expired');
      return res.json({
        status: 'success',
        hasAccess: false,
        message: 'Subscription has expired'
      });
    }

    // Check if user has access to the requested page
    const allowedPages = SUBSCRIPTION_PLANS[payment.plan]?.allowedPages || [];
    const hasAccess = allowedPages.includes(page);
    console.log('[PageAccess] Allowed pages:', allowedPages, 'Has access:', hasAccess);

    res.json({
      status: 'success',
      hasAccess,
      message: hasAccess ? 'Access granted' : 'Access denied'
    });
  } catch (error) {
    console.error('Page access check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check page access'
    });
  }
};

// Get subscription
exports.getSubscription = async function(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!validateSubscriptionData(user.subscription)) {
      return { status: 'inactive', plan: 'none' };
    }

    return user.subscription;
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

    if (!validateSubscriptionData(subscriptionData)) {
      throw new Error('Invalid subscription data');
    }

    user.subscription = {
      ...user.subscription,
      ...subscriptionData,
      status: 'active'
    };

    await user.save();
    return user.subscription;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

// Utility: Fix missing or invalid subscription endDate for all users
async function fixAllUserSubscriptionEndDates() {
  try {
    const users = await User.find({ 'subscription.plan': { $ne: 'none' } });
    let fixedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        const plan = user.subscription.plan;
        const startDate = user.subscription.startDate ? new Date(user.subscription.startDate) : null;
        let endDate = user.subscription.endDate ? new Date(user.subscription.endDate) : null;
        const duration = SUBSCRIPTION_PLANS[plan] ? SUBSCRIPTION_PLANS[plan].duration : null;
        
        if (!startDate || !duration) {
          console.log(`Skipping user ${user._id} - Invalid start date or duration`);
          continue;
        }

        if (!endDate || isNaN(endDate.getTime()) || endDate <= startDate) {
          user.subscription.endDate = new Date(startDate.getTime() + duration);
          user.subscription.status = 'active';
          await user.save();
          fixedCount++;
          console.log(`Fixed endDate for user ${user._id} (${plan})`);
        }
      } catch (userError) {
        errorCount++;
        console.error(`Error fixing subscription for user ${user._id}:`, userError);
      }
    }

    console.log(`Checked ${users.length} users. Fixed ${fixedCount} subscriptions. Errors: ${errorCount}`);
    return { checked: users.length, fixed: fixedCount, errors: errorCount };
  } catch (error) {
    console.error('Error in fixAllUserSubscriptionEndDates:', error);
    throw error;
  }
}

// Export the fix function
exports.fixAllUserSubscriptionEndDates = fixAllUserSubscriptionEndDates; 