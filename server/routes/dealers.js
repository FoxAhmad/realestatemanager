const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all salespersons (Admin only)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
      ['dealer']
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salesperson by ID
router.get('/:id', auth, adminOnly, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create salesperson (Admin only)
// This is the ONLY way salespersons can be created - salespersons cannot self-register
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hashedPassword, 'dealer']
    );

    res.status(201).json({
      ...result.rows[0],
      message: 'Salesperson account created successfully. Salesperson can now login with these credentials.'
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update salesperson (Admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    let result;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await db.query(
        'UPDATE users SET name = $1, email = $2, password = $3 WHERE id = $4 AND role = $5 RETURNING id, name, email, role, created_at',
        [name, email, hashedPassword, req.params.id, 'dealer']
      );
    } else {
      result = await db.query(
        'UPDATE users SET name = $1, email = $2 WHERE id = $3 AND role = $4 RETURNING id, name, email, role, created_at',
        [name, email, req.params.id, 'dealer']
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete salesperson (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

