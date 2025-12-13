/**
 * DeDoc Backend API - Main Entry Point
 * Works for both local development and Vercel serverless deployment
 * For Vercel: Set root directory to "api"
 * For local dev: Run "npm run dev" from backends folder
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

// MongoDB connection with serverless-optimized options
const connectDB = async () => {
  // Check if already connected (for serverless function reuse)
  if (mongoose.connection.readyState === 1) {
    console.log('✅ MongoDB already connected');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10s
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 1, // Maintain at least 1 socket connection
      maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
      retryWrites: true,
      w: 'majority'
    });
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    // Don't throw - allow serverless function to start
    // Connection will be retried on next request
  }
};

// Connect to MongoDB
connectDB();

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
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

// Start server only when run directly (local development)
// In Vercel serverless, this won't execute
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API available at: http://localhost:${PORT}`);
  });
}
