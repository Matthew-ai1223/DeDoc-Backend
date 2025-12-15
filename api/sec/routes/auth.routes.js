const express = require('express');
const router = express.Router();
const { register, login, getCurrentUser } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const User = require('../models/User');

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.get('/user', protect, getCurrentUser);

// Get all users (admin only)
router.get('/users', async (req, res) => {
    try {
        console.log('Fetching users...'); // Debug log
        const users = await User.find({}, '-password'); // Exclude password field
        console.log('Found users:', users); // Debug log
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users: ' + error.message });
    }
});

module.exports = router; 