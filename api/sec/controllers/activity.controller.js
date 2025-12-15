const UserActivity = require('../models/UserActivity');

// Create a new activity log entry
exports.logActivity = async (req, res) => {
  try {
    const {
      action,
      username,
      userId,
      details,
      metadata
    } = req.body || {};

    if (!action) {
      return res.status(400).json({ message: 'action is required' });
    }

    const entry = await UserActivity.create({
      action,
      username,
      userId,
      details,
      metadata,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ message: 'logged', id: entry._id });
  } catch (error) {
    console.error('Activity log error:', error);
    res.status(500).json({ message: 'Failed to log activity' });
  }
};

// Get recent activity log entries (for admin)
exports.getActivities = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const activities = await UserActivity.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(activities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ message: 'Failed to fetch activity log' });
  }
};
