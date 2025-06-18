const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check subscription status
exports.checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.subscription || user.subscription.plan === 'none') {
      return res.status(403).json({ message: 'Active subscription required' });
    }

    // Check if subscription has expired
    if (new Date() > user.subscription.endDate) {
      user.subscription = {
        plan: 'none',
        startDate: null,
        endDate: null
      };
      await user.save();
      return res.status(403).json({ message: 'Subscription has expired' });
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ message: 'Subscription check failed' });
  }
};

module.exports = { protect }; 