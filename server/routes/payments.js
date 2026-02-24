const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Get all payments (Salespersons see only their own, Admin sees all)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT p.*, d.dealer_id, d.sale_price
        FROM payments p
        LEFT JOIN deals d ON p.deal_id = d.id
        ORDER BY p.payment_date DESC
      `);
    } else {
      result = await db.query(`
        SELECT p.*, d.dealer_id, d.sale_price
        FROM payments p
        LEFT JOIN deals d ON p.deal_id = d.id
        WHERE d.dealer_id = $1
        ORDER BY p.payment_date DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get payments for a deal
router.get('/deal/:dealId', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM payments WHERE deal_id = $1 ORDER BY payment_date DESC',
      [req.params.dealId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create payment
router.post('/', auth, async (req, res) => {
  try {
    const { deal_id, payment_type, amount, payment_date, notes } = req.body;

    if (!deal_id || !payment_type || !amount || !payment_date) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const result = await db.query(
      'INSERT INTO payments (deal_id, payment_type, amount, payment_date, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [deal_id, payment_type, amount, payment_date, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update payment
router.put('/:id', auth, async (req, res) => {
  try {
    const { payment_type, amount, payment_date, notes } = req.body;

    const result = await db.query(
      'UPDATE payments SET payment_type = $1, amount = $2, payment_date = $3, notes = $4 WHERE id = $5 RETURNING *',
      [payment_type, amount, payment_date, notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete payment
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
