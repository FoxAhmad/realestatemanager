const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

const adminAndAccountantOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
    return res.status(403).json({ message: 'Access denied. Admins and Accountants only.' });
  }
  next();
};

const dealerOnly = (req, res, next) => {
  if (req.user.role !== 'dealer') {
    return res.status(403).json({ message: 'Access denied. Salesperson only.' });
  }
  next();
};

module.exports = { auth, adminOnly, adminAndAccountantOnly, dealerOnly };

