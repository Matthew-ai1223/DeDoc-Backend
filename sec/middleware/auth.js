const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ message: 'No authentication token, access denied' });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (e) {
            res.status(401).json({ message: 'Token is not valid' });
        }
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { auth }; 