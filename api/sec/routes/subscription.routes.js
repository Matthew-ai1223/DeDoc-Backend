const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  initializePayment,
  verifyPayment,
  getSubscriptionStatus,
  checkPageAccess
} = require('../controllers/subscription.controller');

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

module.exports = router; 