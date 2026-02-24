const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const db = require('../config/database');

// Get all customers (Salespersons see only customers they created, Admin sees all)
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT c.*, u.name as created_by_name 
        FROM customers c
        LEFT JOIN users u ON c.created_by = u.id
        ORDER BY c.created_at DESC
      `);
    } else {
      // Salespersons see only customers they created
      result = await db.query(`
        SELECT c.*, u.name as created_by_name 
        FROM customers c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.created_by = $1
        ORDER BY c.created_at DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get customer by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, u.name as created_by_name 
       FROM customers c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Salespersons can only view their own customers
    if (req.user.role === 'dealer' && result.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view your own customers.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create customer
router.post('/', auth, async (req, res) => {
  try {
    const { name, cnic, phone_number, email, address, status, source } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    // Set created_by to current user (salesperson or admin)
    const createdBy = req.user.role === 'admin' ? (req.body.created_by || req.user.id) : req.user.id;

    // Validate status and source
    const customerStatus = status || 'potential';
    const customerSource = source || 'walk_in';

    if (!['potential', 'successful', 'unsuccessful'].includes(customerStatus)) {
      return res.status(400).json({ message: 'Invalid status. Must be potential, successful, or unsuccessful' });
    }

    if (!['walk_in', 'lead_conversion'].includes(customerSource)) {
      return res.status(400).json({ message: 'Invalid source. Must be walk_in or lead_conversion' });
    }

    const result = await db.query(
      `INSERT INTO customers (name, cnic, phone_number, email, address, status, source, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, cnic || null, phone_number || null, email || null, address || null, customerStatus, customerSource, createdBy]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'CNIC already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update customer
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, cnic, phone_number, email, address, status } = req.body;

    // Check if customer exists and dealer has permission
    const checkResult = await db.query(
      'SELECT created_by FROM customers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Salespersons can only update their own customers
    if (req.user.role === 'dealer' && checkResult.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only update your own customers.' });
    }

    // Validate status if provided
    if (status && !['potential', 'successful', 'unsuccessful'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be potential, successful, or unsuccessful' });
    }

    const result = await db.query(
      'UPDATE customers SET name = $1, cnic = $2, phone_number = $3, email = $4, address = $5, status = COALESCE($6, status) WHERE id = $7 RETURNING *',
      [name, cnic, phone_number, email || null, address, status || null, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete customer
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if customer exists and dealer has permission
    const checkResult = await db.query(
      'SELECT created_by FROM customers WHERE id = $1',
      [req.params.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Salespersons can only delete their own customers
    if (req.user.role === 'dealer' && checkResult.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own customers.' });
    }

    await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
