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

module.exports = router;