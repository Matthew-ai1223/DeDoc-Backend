/**
 * DeDoc Backend API - Vercel Serverless Function
 * This is the entry point for Vercel deployment
 * Root directory in Vercel should be set to: api
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Root route - API information
app.get('/', (req, res) => {
  res.json({
    message: 'DeDoc Backend API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      subscription: '/api/subscription',
      payments: '/api/payments'
    }
  });
});

// Import route modules
const authRoutes = require('./sec/routes/auth.routes');
const subscriptionRoutes = require('./sec/routes/subscription.routes');
const paymentRoutes = require('./sec/routes/payment.routes');
const subscriptionVerificationRoutes = require('./sec/routes/subscription.verification.routes');

// Register API routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscription/verification', subscriptionVerificationRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    // Don't throw - allow serverless function to start even if DB connection fails
    // Connection will be retried on next request
  });

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.path
  });
});

// Export the Express app for Vercel serverless function
module.exports = app;
