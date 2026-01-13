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

// MongoDB connection with serverless-optimized options
let isConnecting = false;
let connectionPromise = null;

// Disable buffering globally to prevent timeout errors in serverless
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  // Check if already connected (for serverless function reuse)
  if (mongoose.connection.readyState === 1) {
    console.log('MongoDB already connected');
    return mongoose.connection;
  }

  // If already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    console.log('Waiting for existing connection...');
    return connectionPromise;
  }

  // Start new connection
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // Increased to 10s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        connectTimeoutMS: 10000, // Give up initial connection after 10s
        maxPoolSize: 10, // Maintain up to 10 socket connections
        minPoolSize: 1, // Maintain at least 1 socket connection
        maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
        retryWrites: true,
        w: 'majority',
        // Serverless-specific options
        bufferCommands: false
      });
      console.log('Connected to MongoDB');
      isConnecting = false;
      return mongoose.connection;
    } catch (err) {
      console.error('MongoDB connection error:', err.message);
      isConnecting = false;
      connectionPromise = null;
      throw err; // Re-throw to allow middleware to handle
    }
  })();

  return connectionPromise;
};

// Middleware to ensure DB connection before handling requests
const ensureDBConnection = async (req, res, next) => {
  try {
    // Check connection state
    const state = mongoose.connection.readyState;

    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    if (state === 1) {
      // Already connected
      return next();
    }

    if (state === 2) {
      // Currently connecting, wait for it
      console.log('Connection in progress, waiting...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      return next();
    }

    // Not connected, establish connection
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection failed in middleware:', error);
    res.status(503).json({
      message: 'Database connection failed. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Import route modules
const authRoutes = require('./sec/routes/auth.routes');
const subscriptionRoutes = require('./sec/routes/subscription.routes');
const paymentRoutes = require('./sec/routes/payment.routes');
const subscriptionVerificationRoutes = require('./sec/routes/subscription.verification.routes');
const activityRoutes = require('./sec/routes/activity.routes');

// Register API routes with DB connection middleware
app.use('/api/auth', ensureDBConnection, authRoutes);
app.use('/api/subscription', ensureDBConnection, subscriptionRoutes);
app.use('/api/payments', ensureDBConnection, paymentRoutes);
app.use('/api/subscription/verification', ensureDBConnection, subscriptionVerificationRoutes);
app.use('/api/activity', ensureDBConnection, activityRoutes);

// Connect to MongoDB on startup (non-blocking for serverless)
connectDB().catch(err => {
  console.error('Initial MongoDB connection attempt failed:', err.message);
  // Don't throw - connection will be retried on first request
});

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
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
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API available at: http://localhost:${PORT}`);
  });
}
