const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['login', 'logout', 'register'],
      required: true
    },
    username: {
      type: String
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    ip: String,
    userAgent: String,
    details: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false }
  }
);

module.exports = mongoose.model('UserActivity', userActivitySchema);
