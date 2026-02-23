const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  initializePayment,
  verifyPayment,
  getSubscriptionStatus,
  checkPageAccess
} = require('../controllers/subscription.controller');
const User = require('../models/User');

// Admin route to get all subscription data
router.get('/admin-data', async (req, res) => {
  try {
    const User = require('../models/User');
    const Payment = require('../models/Payment');

    const users = await User.find({}, 'fullName email subscription createdAt');

    // Get all successful payments
    const payments = await Payment.find({ status: 'success' }).populate('userId', 'fullName email');

    // Calculate subscription statistics
    const totalUsers = users.length;
    const activeSubscriptions = users.filter(user =>
      user.subscription &&
      user.subscription.plan !== 'none' &&
      new Date(user.subscription.endDate) > new Date()
    ).length;

    // Calculate total revenue from actual payments
    const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const averageRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;

    const subscriptionStats = {
      totalUsers,
      activeSubscriptions,
      totalRevenue,
      averageRevenuePerUser
    };

    // Get plan distribution from payments
    const planDistribution = {};
    payments.forEach(payment => {
      const plan = payment.plan;
      planDistribution[plan] = (planDistribution[plan] || 0) + 1;
    });

    // Get recent transactions from payments
    const recentTransactions = payments
      .map(payment => ({
        id: payment._id,
        user: payment.userId?.fullName || 'Unknown User',
        plan: payment.plan,
        amount: payment.amount,
        date: payment.subscriptionStart || payment.createdAt,
        status: new Date(payment.subscriptionEnd) > new Date() ? 'Active' : 'Expired'
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10); // Get last 10 transactions

    res.json({
      stats: subscriptionStats,
      planDistribution,
      recentTransactions
    });
  } catch (error) {
    console.error('Error fetching admin subscription data:', error);
    res.status(500).json({ message: 'Error fetching subscription data' });
  }
});

// Main subscription routes for status and access checks
router.post('/initialize', protect, initializePayment);
router.get('/status', protect, getSubscriptionStatus);
router.get('/check-access', protect, checkPageAccess);

// Admin: manually renew a user's subscription
// NOTE: getSubscriptionStatus and checkPageAccess both query the Payment
// collection (not user.subscription), so we must create a Payment record
// with status:'success' — otherwise the app still sees the user as inactive.
const PLAN_DURATIONS = {
  basic: 60 * 60 * 1000,                  // 1 hour
  standard: 7 * 24 * 60 * 60 * 1000,        // 1 week
  premium: 14 * 24 * 60 * 60 * 1000,        // 2 weeks
  pro: 30 * 24 * 60 * 60 * 1000,        // 1 month
  paygo: 24 * 60 * 60 * 1000              // 1 day
};

const PLAN_AMOUNTS = {
  basic: 5000,
  standard: 45000,
  premium: 85000,
  pro: 160000,
  paygo: 35000
};

router.post('/admin/renew/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, durationDays } = req.body;

    if (!plan || !PLAN_DURATIONS[plan]) {
      return res.status(400).json({ message: 'Invalid or missing subscription plan' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const Payment = require('../models/Payment');
    const now = new Date();
    const reference = `admin-renew-${userId}-${Date.now()}`;

    // Duration: use custom days if provided, otherwise fall back to plan default
    const durationMs = durationDays
      ? Number(durationDays) * 24 * 60 * 60 * 1000
      : PLAN_DURATIONS[plan];

    // ─── 1. Create a Payment record (this is what the app checks) ──────────
    // We do NOT pass subscriptionStart here so the pre-save hook calculates
    // the standard plan dates. If a custom durationDays was requested we will
    // patch subscriptionEnd afterwards via findByIdAndUpdate (bypasses hook).
    const payment = new Payment({
      userId: user._id,
      reference,
      amount: PLAN_AMOUNTS[plan],
      plan,
      status: 'success',
      paymentProvider: 'admin',
      metadata: {
        adminRenewal: true,
        renewedAt: now.toISOString(),
        durationDays: durationDays || null
      }
    });
    await payment.save(); // hook sets subscriptionStart = now, subscriptionEnd = plan default

    // If admin specified a custom duration, override subscriptionEnd directly
    if (durationDays && Number(durationDays) > 0) {
      const customEnd = new Date(payment.subscriptionStart.getTime() + durationMs);
      await Payment.findByIdAndUpdate(payment._id, { subscriptionEnd: customEnd });
      payment.subscriptionEnd = customEnd; // keep local reference in sync
    }

    const finalEnd = payment.subscriptionEnd;

    // ─── 2. Also keep user.subscription in sync ────────────────────────────
    user.subscription = {
      plan,
      startDate: now,
      endDate: finalEnd,
      lastPaymentDate: now,
      status: 'active',
      reference
    };
    await user.save();

    return res.json({
      message: `Subscription renewed successfully for ${user.fullName || user.email}`,
      subscription: user.subscription,
      payment: {
        reference,
        plan,
        subscriptionStart: payment.subscriptionStart,
        subscriptionEnd: finalEnd
      }
    });
  } catch (error) {
    console.error('Admin renew error:', error);
    res.status(500).json({ message: 'Failed to renew subscription' });
  }
});

// ─── WhatsApp Bot Subscription Check ───────────────────────────────────────
router.get('/whatsapp/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    // Attempt to find user with variations of the phone number (e.g. 080... vs 23480...)
    const User = require('../models/User');
    // Remove '+' if any
    const cleanPhone = phone.replace('+', '');

    // Find a user where the phone number ends with the same ending digits (last 10)
    // to handle international and local formats matching
    const searchRegex = new RegExp(`${cleanPhone.slice(-10)}$`);
    const user = await User.findOne({ phoneNumber: searchRegex });

    if (!user) {
      return res.json({
        success: true,
        isRegistered: false,
        isSubscribed: false,
        message: 'User account not found'
      });
    }

    // Check subscription status
    const hasActiveSubscription =
      user.subscription &&
      user.subscription.plan &&
      user.subscription.plan !== 'none' &&
      user.subscription.plan !== 'free' &&
      new Date(user.subscription.endDate) > new Date();

    return res.json({
      success: true,
      isRegistered: true,
      isSubscribed: hasActiveSubscription,
      plan: user.subscription?.plan || 'none',
      endDate: user.subscription?.endDate || null,
      userName: user.fullName || user.username
    });

  } catch (error) {
    console.error('WhatsApp subscription check error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── WhatsApp Bot Account Link ───────────────────────────────────────
router.post('/whatsapp/link', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email || !phone) {
      return res.status(400).json({ success: false, message: 'Email and phone are required' });
    }

    const User = require('../models/User');

    // Find user by email (case-insensitive)
    const user = await User.findOne({ email: new RegExp('^' + email.trim() + '$', 'i') });

    if (!user) {
      return res.json({
        success: false,
        message: 'No account found with that email address.'
      });
    }

    // Update their registered phone number to this WhatsApp number
    const cleanPhone = phone.replace('+', '');
    user.phoneNumber = cleanPhone;
    await user.save();

    // Check if they have an active subscription right now
    const hasActiveSubscription =
      user.subscription &&
      user.subscription.plan &&
      user.subscription.plan !== 'none' &&
      user.subscription.plan !== 'free' &&
      new Date(user.subscription.endDate) > new Date();

    return res.json({
      success: true,
      message: 'Account linked successfully!',
      isSubscribed: hasActiveSubscription,
      userName: user.fullName || user.username
    });

  } catch (error) {
    console.error('WhatsApp account link error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── WhatsApp Bot Generate Payment Link ────────────────────────────────────
router.post('/whatsapp/pay', async (req, res) => {
  try {
    const { phone, plan } = req.body;

    if (!phone || !plan) {
      return res.status(400).json({ success: false, message: 'Phone and plan are required' });
    }

    const User = require('../models/User');
    const Payment = require('../models/Payment');
    const https = require('https');

    // Find user
    const cleanPhone = phone.replace('+', '');
    const searchRegex = new RegExp(`${cleanPhone.slice(-10)}$`);
    const user = await User.findOne({ phoneNumber: searchRegex });

    if (!user) {
      return res.json({ success: false, message: 'Account not found. Please register first.' });
    }

    // Define plans and prices (matching your backend/frontend)
    const SUBSCRIPTION_PLANS = {
      basic: { amount: 5000 },
      standard: { amount: 45000 },
      premium: { amount: 85000 },
      pro: { amount: 160000 },
      paygo: { amount: 35000 }
    };

    const selectedPlan = SUBSCRIPTION_PLANS[plan.toLowerCase()];
    if (!selectedPlan) {
      return res.json({ success: false, message: 'Invalid plan selected. Valid options: paygo, premium, pro' });
    }

    // Initialize PayStack Transaction
    const frontendUrl = process.env.FRONTEND_URL || 'https://dedoc.vercel.app';
    const params = JSON.stringify({
      email: user.email,
      amount: selectedPlan.amount,
      metadata: {
        userId: user._id,
        plan: plan.toLowerCase(),
        source: 'whatsapp'
      },
      callback_url: `${frontendUrl}/payment-verification.html`
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

      paymentRes.on('end', async () => {
        try {
          const response = JSON.parse(data);
          if (response.status && response.data && response.data.authorization_url) {
            const reference = response.data.reference;

            // Store the reference as the active one for this user
            user.activePaymentReference = reference;
            await user.save();

            // Create a Payment record in the DB so the normal verify flow can find it
            await Payment.create({
              userId: user._id,
              reference: reference,
              amount: selectedPlan.amount / 100, // store in Naira
              plan: plan.toLowerCase(),
              status: 'pending',
              metadata: { source: 'whatsapp', phone: cleanPhone }
            });

            return res.json({
              success: true,
              paymentUrl: response.data.authorization_url,
              message: `Here is your secured Paystack link to upgrade to ${plan}:`
            });
          } else {
            return res.json({ success: false, message: 'Failed to generate payment link: ' + response.message });
          }
        } catch (error) {
          console.error('Paystack parsing error:', error);
          return res.status(500).json({ success: false, message: 'Error processing payment response' });
        }
      });
    }).on('error', (error) => {
      console.error('PayStack initialize error:', error);
      return res.status(500).json({ success: false, message: 'Payment gateway error' });
    });

    paymentReq.write(params);
    paymentReq.end();

  } catch (error) {
    console.error('WhatsApp payment generation error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── WhatsApp Bot No-Auth Payment Verification ──────────────────────────────
// This allows payment-verification.html to verify WhatsApp payments without a login token.
router.get('/whatsapp/verify', async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ status: 'error', message: 'Reference is required' });
    }

    const User = require('../models/User');
    const Payment = require('../models/Payment');
    const https = require('https');

    // Find the payment record created during WhatsApp pay link generation
    const payment = await Payment.findOne({ reference, 'metadata.source': 'whatsapp' });

    if (!payment) {
      return res.status(404).json({ status: 'error', message: 'WhatsApp payment record not found for this reference.' });
    }

    // Don't re-verify if already successful
    if (payment.status === 'success') {
      const user = await User.findById(payment.userId);
      return res.json({
        status: 'success',
        message: 'Payment already verified',
        data: { subscription: user?.subscription }
      });
    }

    // Verify with Paystack
    const verifyOptions = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    };

    const verifyReq = https.request(verifyOptions, verifyRes => {
      let data = '';
      verifyRes.on('data', (chunk) => { data += chunk; });
      verifyRes.on('end', async () => {
        try {
          const pstackData = JSON.parse(data);

          if (!pstackData.status || pstackData.data?.status !== 'success') {
            return res.status(400).json({ status: 'error', message: 'Payment not successful on Paystack.' });
          }

          const { userId, plan } = pstackData.data.metadata || {};
          const planDurations = {
            basic: 2 * 60 * 60 * 1000,
            standard: 7 * 24 * 60 * 60 * 1000,
            premium: 14 * 24 * 60 * 60 * 1000,
            pro: 30 * 24 * 60 * 60 * 1000,
            paygo: 24 * 60 * 60 * 1000
          };

          const now = new Date();
          const duration = planDurations[plan] || planDurations.paygo;
          const endDate = new Date(now.getTime() + duration);

          // Update payment record
          payment.status = 'success';
          payment.verified = true;
          payment.verificationDate = now;
          payment.subscriptionStart = now;
          payment.subscriptionEnd = endDate;
          await payment.save();

          // Update user subscription
          const user = await User.findById(userId || payment.userId);
          if (user) {
            user.subscription = {
              plan: plan,
              startDate: now,
              endDate: endDate,
              reference: reference,
              status: 'active'
            };
            // Clear the activePaymentReference once payment is confirmed
            user.activePaymentReference = undefined;
            await user.save();
          }

          return res.json({
            status: 'success',
            message: 'Payment verified and subscription activated!',
            data: {
              subscription: {
                plan: plan,
                startDate: now,
                endDate: endDate,
                status: 'active'
              }
            }
          });
        } catch (err) {
          console.error('WhatsApp verify parse error:', err);
          return res.status(500).json({ status: 'error', message: 'Error verifying with Paystack' });
        }
      });
    }).on('error', (err) => {
      console.error('WhatsApp verify request error:', err);
      return res.status(500).json({ status: 'error', message: 'Payment gateway error' });
    });

    verifyReq.end();

  } catch (error) {
    console.error('WhatsApp verify error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

module.exports = router;