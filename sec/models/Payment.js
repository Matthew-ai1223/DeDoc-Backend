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

module.exports = mongoose.model('Payment', paymentSchema); 