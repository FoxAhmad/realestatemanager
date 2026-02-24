const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Get all investors (Admin sees only their own, Salespersons see only their own)
router.get('/', auth, async (req, res) => {
  try {
    // Both admin and salespersons see only their own investors
    const result = await db.query(`
      SELECT * FROM investors
      WHERE salesperson_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get investor by ID (Both admin and salespersons can only see their own)
router.get('/:id', auth, async (req, res) => {
  try {
    // Both admin and salespersons can only view their own investors
    const result = await db.query(`
      SELECT * FROM investors
      WHERE id = $1 AND salesperson_id = $2
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Investor not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create investor (Both admin and salespersons can create, automatically assigned to them)
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, address, total_invested, paid_amount } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const totalInvested = parseFloat(total_invested || 0);
    const paidAmount = parseFloat(paid_amount || 0);
    const remainingBalance = totalInvested - paidAmount;

    const result = await db.query(`
      INSERT INTO investors (salesperson_id, name, phone, address, total_invested, paid_amount, remaining_balance)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, name, phone || null, address || null, totalInvested, paidAmount, remainingBalance]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update investor (Both admin and salespersons can update their own)
router.put('/:id', auth, async (req, res) => {
  try {
    // Check if investor exists and belongs to the user (admin or salesperson)
    const checkResult = await db.query(
      'SELECT * FROM investors WHERE id = $1 AND salesperson_id = $2',
      [req.params.id, req.user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Investor not found' });
    }

    const { name, phone, address, total_invested, paid_amount } = req.body;

    // Calculate remaining balance
    const totalInvested = parseFloat(total_invested !== undefined ? total_invested : checkResult.rows[0].total_invested);
    const paidAmount = parseFloat(paid_amount !== undefined ? paid_amount : checkResult.rows[0].paid_amount);
    const remainingBalance = totalInvested - paidAmount;

    const result = await db.query(`
      UPDATE investors 
      SET name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          total_invested = COALESCE($4, total_invested),
          paid_amount = COALESCE($5, paid_amount),
          remaining_balance = $6
      WHERE id = $7 AND salesperson_id = $8
      RETURNING *
    `, [name, phone, address, totalInvested, paidAmount, remainingBalance, req.params.id, req.user.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete investor (Both admin and salespersons can delete their own)
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM investors WHERE id = $1 AND salesperson_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Investor not found' });
    }

    res.json({ message: 'Investor deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

