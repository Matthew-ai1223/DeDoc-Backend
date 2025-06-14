const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication token is required'
            });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                console.error('JWT Verification Error:', err);
                return res.status(403).json({
                    status: 'error',
                    message: 'Invalid or expired token'
                });
            }

            req.user = user;
            next();
        });
    } catch (error) {
        console.error('Authentication Error:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Authentication failed'
        });
    }
};

module.exports = {
    authenticateToken
}; 