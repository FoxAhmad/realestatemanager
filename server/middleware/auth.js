const jwt = require('jsonwebtoken');
const db = require('../config/database');
const tenantService = require('../services/tenantService');

// Verifies the JWT, then loads the user's tenant/branch context from the DATABASE (never from the token or
// request body, except X-Branch-Id which is validated against the user's allowed branches) and runs the rest
// of the request inside it. See config/database.js for how the context becomes row-level security.
// ponytail: 3 small lookups per request, add a short TTL cache if this shows up in profiling.
const auth = async (req, res, next) => {
  let decoded;
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (error) {
    return res.status(401).json({ message: 'Token is not valid' });
  }

  try {
    const u = await db.admin.query('SELECT id, name, email, role, tenant_id FROM users WHERE id = $1', [decoded.id]);
    if (!u.rows.length) return res.status(401).json({ message: 'Token is not valid' });
    const user = u.rows[0];
    req.user = { ...decoded, role: user.role, tenant_id: user.tenant_id };

    // Platform super_admins belong to no tenant: no context, so tenant tables are invisible to them.
    if (user.role === 'super_admin') {
      if (!/^\/api\/(tenants|auth)(\/|$)/.test(req.baseUrl)) {
        return res.status(403).json({ message: 'Platform admins can only use the tenant management API' });
      }
      return next();
    }

    const ctx = await tenantService.loadContext(user, req.header('X-Branch-Id'));
    req.tenant = ctx.tenant;
    req.tenantId = ctx.tenantId;
    req.branches = ctx.branches;
    req.dbCtx = ctx;
    res.on('close', () => db.releaseContext(ctx));
    db.als.run(ctx, next);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error('Auth context error:', error);
    res.status(500).json({ message: 'Server error' });
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

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Access denied. Platform admin only.' });
  }
  next();
};

module.exports = { auth, adminOnly, adminAndAccountantOnly, dealerOnly, superAdminOnly };

