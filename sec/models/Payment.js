const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reference: {
        type: String,
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true
    },
    plan: {
        type: String,
        required: true,
        enum: ['basic', 'standard', 'premium', 'pro']
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'success', 'failed'],
        default: 'pending'
    },
    subscriptionStart: {
        type: Date
    },
    subscriptionEnd: {
        type: Date
    },
    paymentProvider: {
        type: String,
        default: 'paystack'
    },
    paymentResponse: {
        type: Object
    },
    metadata: {
        type: Object
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
paymentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Calculate subscription end date based on plan
paymentSchema.methods.calculateSubscriptionEnd = function() {
    const durations = {
        'basic': 2 * 60 * 60 * 1000, // 2 hours
        'standard': 7 * 24 * 60 * 60 * 1000, // 1 week
        'premium': 14 * 24 * 60 * 60 * 1000, // 2 weeks
        'pro': 30 * 24 * 60 * 60 * 1000 // 1 month
    };

    const now = new Date();
    this.subscriptionStart = now;
    this.subscriptionEnd = new Date(now.getTime() + durations[this.plan]);
};

module.exports = mongoose.model('Payment', paymentSchema); 