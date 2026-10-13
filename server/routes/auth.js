const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const tenantService = require('../services/tenantService');

// Tenant/plan/branch info the client needs after login (none for platform super_admins).
const sessionInfo = async (user) => {
  if (user.role === 'super_admin') return { tenant: null, branches: [] };
  const ctx = await tenantService.loadContext(user);
  return {
    tenant: { id: ctx.tenant.id, name: ctx.tenant.name, plan: ctx.tenant.plan },
    branches: ctx.branches.filter((b) => ctx.readBranchIds.includes(b.id)),
  };
};

// Register - Admin only (for creating admin accounts)
// Dealers can only be created through /api/dealers endpoint (admin only)
router.post('/register', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Only allow creating admin accounts through this endpoint
    // Dealers must be created through /api/dealers
    if (role && role !== 'admin') {
      return res.status(400).json({ message: 'Only admin accounts can be created here. Use /api/dealers to create salesperson accounts.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hashedPassword, 'admin']
    );

    const user = result.rows[0];

    res.status(201).json({
      user
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const result = await db.admin.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Only allow login for admin, accountant, and dealer roles
    // Salespersons can only login with accounts created by admin through /api/dealers
    if (!['admin', 'dealer', 'accountant', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ 
        message: 'Access denied. Only admin, accountant, and salesperson accounts can login. Salespersons must be created by admin.' 
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    const info = await sessionInfo(user);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      ...info
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.admin.query(
      'SELECT id, name, email, role, tenant_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ ...result.rows[0], ...(await sessionInfo(result.rows[0])) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update own profile (name / email)
router.put('/profile', require('../middleware/auth').auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    const result = await db.admin.query( // own row only (WHERE id = req.user.id); works for super_admin too
      'UPDATE users SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, email, role',
      [name, email, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Change own password
router.put('/password', require('../middleware/auth').auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const found = await db.admin.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (found.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, found.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.admin.query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashed, req.user.id]);

    res.json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
