const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { auth, adminOnly, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');
const { assertLimitFor } = require('../services/entitlementService');

// Get all salespersons (Admin and Accountant)
router.get('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email, role, created_at FROM users WHERE role IN ('dealer', 'admin') ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
});

// Get salesperson by ID
router.get('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'dealer']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
});

// Create salesperson (Admin and Accountant)
// This is the ONLY way salespersons can be created - salespersons cannot self-register
router.post('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const userRole = role || 'dealer';

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Validate role
    if (!['admin', 'dealer', 'accountant'].includes(userRole)) {
      return res.status(400).json({ message: 'Invalid role provided' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    await assertLimitFor(req.tenantId, 'users'); // plan limit: 403 USER_LIMIT_REACHED with an upgrade message

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, userRole]
    );

    res.status(201).json({
      ...result.rows[0],
      message: 'Salesperson account created successfully. Salesperson can now login with these credentials.'
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
});

// Update salesperson (Admin and Accountant)
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    if (role && !['admin', 'dealer', 'accountant'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role provided' });
    }

    let result;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await db.query(
        'UPDATE users SET name = $1, email = $2, password = $3, role = COALESCE($4, role) WHERE id = $5 RETURNING id, name, email, role, created_at',
        [name, email, hashedPassword, role, req.params.id]
      );
    } else {
      result = await db.query(
        'UPDATE users SET name = $1, email = $2, role = COALESCE($3, role) WHERE id = $4 RETURNING id, name, email, role, created_at',
        [name, email, role, req.params.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
});

// Delete salesperson (Admin and Accountant)
router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id',
      [req.params.id, 'dealer']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    res.json({ message: 'Salesperson deleted successfully' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Server error', error: error.message, code: error.code });
  }
});

module.exports = router;

