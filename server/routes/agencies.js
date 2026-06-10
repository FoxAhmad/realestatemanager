const express = require('express');
const router = express.Router();
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all agencies
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM agencies ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get agency by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM agencies WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agency not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create agency
router.post('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Please provide agency name' });
    }

    const result = await db.query(
      'INSERT INTO agencies (name, phone, address) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, address]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update agency
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const result = await db.query(
      'UPDATE agencies SET name = $1, phone = $2, address = $3 WHERE id = $4 RETURNING *',
      [name, phone, address, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agency not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete agency
router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM agencies WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agency not found' });
    }

    res.json({ message: 'Agency deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
