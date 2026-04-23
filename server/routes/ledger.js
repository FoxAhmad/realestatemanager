const express = require('express');
const router = express.Router();
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');
const ledgerService = require('../services/ledgerService');

// Get all general accounts
router.get('/accounts', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM accounts ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get transactions (filter by date, type)
router.get('/transactions', auth, async (req, res) => {
  try {
    const { startDate, endDate, reference_type } = req.query;
    let query = `
      SELECT 
        t.id, t.transaction_date, t.description, t.reference_type, t.reference_id,
        tl.debit, tl.credit, a.name as account_name, tl.user_id
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      JOIN accounts a ON tl.account_id = a.id
      WHERE 1=1
    `;
    const params = [];

    // Filter rules
    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
      // Dealers only see lines they are involved in
      query += ` AND tl.user_id = $${params.length + 1}`;
      params.push(req.user.id);
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND t.transaction_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND t.transaction_date <= $${params.length}`;
    }
    if (reference_type) {
      params.push(reference_type);
      query += ` AND t.reference_type = $${params.length}`;
    }

    query += ' ORDER BY t.transaction_date DESC, t.id DESC';
    const result = await db.query(query, params);
    
    // Group lines by transaction
    const grouped = [];
    let currentTx = null;
    for (let row of result.rows) {
      if (!currentTx || currentTx.id !== row.id) {
        currentTx = {
          id: row.id,
          transaction_date: row.transaction_date,
          description: row.description,
          reference_type: row.reference_type,
          reference_id: row.reference_id,
          lines: []
        };
        grouped.push(currentTx);
      }
      currentTx.lines.push({
        account_name: row.account_name,
        debit: row.debit,
        credit: row.credit,
        user_id: row.user_id
      });
    }

    res.json(grouped);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get balance for an account
router.get('/balance/:accountId', auth, async (req, res) => {
  try {
    // If regular dealer, strictly force user_id to their own ID to safeguard advances.
    const requestedUserId = req.query.user_id || null;
    let effectiveUserId = requestedUserId;

    if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
       effectiveUserId = req.user.id;
    }

    const bal = await ledgerService.calculateBalance(req.params.accountId, effectiveUserId);
    res.json({ account_id: req.params.accountId, user_id: effectiveUserId, balance: bal });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
