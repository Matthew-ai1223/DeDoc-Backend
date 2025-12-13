// Serverless function wrapper for Vercel
const app = require('../sec/index');

// Export as Vercel serverless function
module.exports = (req, res) => {
  return app(req, res);
};

