const User = require('../models/User');
const UserActivity = require('../models/UserActivity');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // Changed to false since port 587 typically uses STARTTLS
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  },
  debug: true, // Enable debug logging
  logger: true,  // Enable logger
  // Add DKIM configuration if available
  dkim: process.env.DKIM_PRIVATE_KEY ? {
    domainName: process.env.DOMAIN_NAME,
    keySelector: process.env.DKIM_SELECTOR,
    privateKey: process.env.DKIM_PRIVATE_KEY
  } : undefined
});

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('Email configuration is valid');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Send welcome email
const sendWelcomeEmail = async (email, fullName, username, password) => {
  try {
    // Log the email configuration (without sensitive data)
    console.log('Email Configuration:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      from: process.env.EMAIL_USER,
      to: email
    });

    const mailOptions = {
      from: {
        name: process.env.EMAIL_FROM_NAME || 'DeDoc',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Welcome to DeDoc – Your Health Companion 🎉',
      headers: {
        'X-Entity-Ref-ID': Date.now().toString(),
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'Precedence': 'bulk',
        'X-Auto-Response-Suppress': 'OOF, AutoReply'
      },
      text: `Hi ${fullName}!\n\nWelcome to DeDoc – we're excited to have you on board! 🎉\n\nYou've just taken a bold step toward better health awareness and support.\n\nYour Login Credentials:\nUsername: ${username}\nPassword: ${password}\n\nAt DeDoc, our intelligent assistant is available 24/7 to:\n\n• Answer your health-related questions 🤖\n• Provide instant medical insights 🔬\n• Help you understand symptoms and possible conditions\n• Support your mental wellness journey 💚\n\nWhat's next?\nExplore the platform and chat with our AI assistant anytime you need a second opinion or general guidance — completely free and private.\n\nGet started at: https://dedoc.vercel.app\n\nIf you have any questions, feel free to reach out. We're here for you.\n\nStay healthy,\nThe DeDoc Team\nYour Health, Your Companion.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              line-height: 1.6; 
              color: #333;
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px;
              background-color: #ffffff;
            }
            .header { 
              background-color: rgb(32, 92, 222); 
              color: white; 
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content { 
              padding: 30px 20px; 
              background-color: rgb(249, 249, 249);
              border-radius: 0 0 8px 8px;
            }
            .content p {
              margin-bottom: 16px;
              font-size: 16px;
            }
            .content ul {
              margin: 20px 0;
              padding-left: 20px;
            }
            .content li {
              margin-bottom: 12px;
              font-size: 15px;
            }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: rgb(32, 92, 222); 
              color: white; 
              text-decoration: none; 
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
              transition: background-color 0.3s ease;
            }
            .button:hover {
              background-color: rgb(25, 73, 177);
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              font-size: 13px; 
              color: #666;
              margin-top: 20px;
            }
            .highlight {
              color: rgb(32, 92, 222);
              font-weight: 600;
            }
            .signature {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
            .emoji {
              font-size: 1.2em;
              margin-right: 4px;
            }
            a {
              color: rgb(32, 92, 222);
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
            .credentials-box {
              background-color: #f8f9fa;
              border: 2px solid rgb(32, 92, 222);
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
              text-align: center;
            }
            .credentials-box h3 {
              margin: 0 0 15px 0;
              color: rgb(32, 92, 222);
              font-size: 18px;
            }
            .credential-item {
              margin: 10px 0;
              font-size: 16px;
            }
            .credential-label {
              font-weight: 600;
              color: #555;
            }
            .credential-value {
              font-family: 'Courier New', monospace;
              background-color: #fff;
              padding: 5px 10px;
              border-radius: 4px;
              border: 1px solid #ddd;
              margin-left: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hi ${fullName}! <span class="emoji">🎉</span></h1>
            </div>
            <div class="content">
              <p>Welcome to <span class="highlight">DeDoc</span> – we're excited to have you on board! <span class="emoji">🎉</span></p>
              <p>You've just taken a bold step toward better health awareness and support.</p>
              
              <div class="credentials-box">
                <h3><span class="emoji">🔐</span> Your Login Credentials</h3>
                <div class="credential-item">
                  <span class="credential-label">Username:</span>
                  <span class="credential-value">${username}</span>
                </div>
                <div class="credential-item">
                  <span class="credential-label">Password:</span>
                  <span class="credential-value">${password}</span>
                </div>
              </div>
              
              <p>At DeDoc, our intelligent assistant is available 24/7 to:</p>
              <ul>
                <li><span class="emoji">🤖</span> Answer your health-related questions</li>
                <li><span class="emoji">🔬</span> Provide instant medical insights</li>
                <li><span class="emoji">💡</span> Help you understand symptoms and possible conditions</li>
                <li><span class="emoji">💚</span> Support your mental wellness journey</li>
              </ul>

              <p><strong>What's next?</strong></p>
              <p>Explore the platform and chat with our AI assistant anytime you need a second opinion or general guidance — completely free and private.</p>

              <p style="text-align: center;">
                <a href="https://dedoc.vercel.app" class="button">Get Started</a>
              </p>

              <p>Need help getting started? Visit <a href="https://dedoc.vercel.app">dedoc.vercel.app</a> and start your first health conversation.</p>

              <p>If you have any questions, feel free to reach out. We're here for you.</p>

              <div class="signature">
                <p>Stay healthy,<br>
                <strong>The DeDoc Team</strong><br>
                <span class="highlight">Your Health, Your Companion.</span></p>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} DeDoc. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Add message ID for better tracking
      messageId: `<${Date.now()}.${Math.random().toString(36).substring(2)}@${process.env.DOMAIN_NAME}>`,
      // Add priority header
      priority: 'high',
      // Add reply-to header
      replyTo: process.env.EMAIL_USER
    };

    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log('SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('SMTP connection verification failed:', verifyError);
      throw new Error('SMTP connection verification failed: ' + verifyError.message);
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sending details:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      envelope: info.envelope
    });
    
    if (info.rejected && info.rejected.length > 0) {
      throw new Error('Email was rejected by the server: ' + info.rejected.join(', '));
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send welcome email:', {
      error: error.message,
      stack: error.stack,
      code: error.code
    });
    throw error;
  }
};

// Register user
exports.register = async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      dateOfBirth,
      phoneNumber,
      state,
      city,
      password,
      confirmPassword,
      termsAccepted
    } = req.body;

    // Validate required fields
    if (!fullName || !username || !email || !dateOfBirth || !phoneNumber || !state || !city || !password) {
      return res.status(400).json({ 
        message: 'All fields are required',
        error: 'Missing required fields'
      });
    }

    // Validate password match
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Check if terms are accepted
    if (!termsAccepted) {
      return res.status(400).json({ message: 'Terms must be accepted' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
      return res.status(400).json({
        message: `User with this ${field} already exists`
      });
    }

    // Create new user
    const user = new User({
      fullName,
      username,
      email: email.toLowerCase(),
      dateOfBirth,
      phoneNumber,
      state,
      city,
      password,
      termsAccepted
    });

    await user.save();

    // Send welcome email (non-blocking - don't fail registration if email fails)
    sendWelcomeEmail(email, fullName, username, password)
      .then(() => {
        console.log('Welcome email sent successfully');
      })
      .catch((emailError) => {
        console.error('Failed to send welcome email (non-critical):', emailError.message);
        // Don't throw - registration should succeed even if email fails
      });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error',
        errors: errors
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists`
      });
    }

    // Handle other errors
    res.status(500).json({ 
      message: error.message || 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        subscription: user.subscription,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

// Get current authenticated user
exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json({
      id: req.user._id,
      fullName: req.user.fullName,
      username: req.user.username,
      email: req.user.email,
      phoneNumber: req.user.phoneNumber,
      subscription: req.user.subscription,
      createdAt: req.user.createdAt
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Failed to load user' });
  }
};

// Reset password using registration info (no email)
exports.forgotPassword = async (req, res) => {
  try {
    const {
      username,
      email,
      dateOfBirth,
      phoneNumber,
      newPassword,
      confirmPassword
    } = req.body || {};

    if (!username || !email || !dateOfBirth || !phoneNumber || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Find user with matching registration info
    const user = await User.findOne({
      username,
      email: email.toLowerCase(),
      phoneNumber,
      dateOfBirth: new Date(dateOfBirth)
    });

    if (!user) {
      return res.status(404).json({
        message: 'No user found with the provided information'
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    // Log password change activity
    try {
      await UserActivity.create({
        action: 'password_change',
        username: user.username,
        userId: user._id,
        details: 'Password reset via forgot password',
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('Failed to log password change activity:', logErr.message);
    }

    res.json({ message: 'Password has been reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};