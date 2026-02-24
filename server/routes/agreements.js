const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Create or update agreement
router.post('/', auth, async (req, res) => {
  try {
    const { deal_id, customer_id, phone_number, slip_pic } = req.body;

    if (!deal_id) {
      return res.status(400).json({ message: 'Deal ID is required' });
    }

    // Check if agreement exists
    const existingResult = await db.query(
      'SELECT * FROM agreements WHERE deal_id = $1',
      [deal_id]
    );

    if (existingResult.rows.length > 0) {
      // Update existing
      const result = await db.query(
        'UPDATE agreements SET customer_id = $1, phone_number = $2, slip_pic = $3 WHERE deal_id = $4 RETURNING *',
        [customer_id, phone_number, slip_pic, deal_id]
      );
      res.json(result.rows[0]);
    } else {
      // Create new
      const result = await db.query(
        'INSERT INTO agreements (deal_id, customer_id, phone_number, slip_pic) VALUES ($1, $2, $3, $4) RETURNING *',
        [deal_id, customer_id, phone_number, slip_pic]
      );
      res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
