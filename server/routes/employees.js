const express = require('express');
const router = express.Router();
const { auth, adminOnly, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all users for employee management (Admin and Accountant)
router.get('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, is_employee, created_at FROM users ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user role / employee status (Admin and Accountant)
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { role, is_employee } = req.body;
    
    // Ensure role is valid
    if (!['admin', 'dealer', 'accountant'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role provided' });
    }

    const isEmp = !!is_employee; // convert to boolean

    const result = await db.query(
      'UPDATE users SET role = $1, is_employee = $2 WHERE id = $3 RETURNING id, name, email, role, is_employee',
      [role, isEmp, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
