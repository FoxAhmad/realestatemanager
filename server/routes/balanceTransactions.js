const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');
const ledgerService = require('../services/ledgerService');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/proofs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * Get all transactions for a specific account
 * Optionally filter by dealer (user_id)
 */
router.get('/:accountId', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { userId, deal_id } = req.query;
    let query = `
      SELECT t.*, tl.debit, tl.credit, u.name as user_name, tl.user_id, a.name as account_name,
             da.customer_price, da.cost_price, da.id as adjustment_id, tl.id as line_id,
             (
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', f_t.id,
                    'date', f_t.transaction_date,
                    'description', f_t.description,
                    'amount', f_tl.credit,
                    'proof_file', f_t.proof_file,
                    'user_name', f_u.name
                ))
                FROM transaction_lines f_tl
                JOIN transactions f_t ON f_tl.transaction_id = f_t.id
                LEFT JOIN users f_u ON f_tl.user_id = f_u.id
                WHERE f_tl.linked_line_id = tl.id
             ) as linked_entries
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      JOIN accounts a ON tl.account_id = a.id
      LEFT JOIN users u ON tl.user_id = u.id
      LEFT JOIN deal_adjustments da ON t.id = da.transaction_id
      WHERE tl.account_id = $1
    `;
    const params = [req.params.accountId];

    if (userId) {
      query += ` AND tl.user_id = $${params.length + 1}`;
      params.push(userId);
    }

    if (deal_id) {
      query += ` AND da.deal_id = $${params.length + 1}`;
      params.push(deal_id);
    }

    query += ` ORDER BY t.transaction_date DESC, t.id DESC`;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * Create a balance update transaction
 */
router.post('/', auth, adminAndAccountantOnly, upload.single('proof_file'), async (req, res) => {
  const client = await db.connect();
  try {
    const { 
      account_id, user_id, amount, date, description, 
      voucher_no, instrument, instrument_number, type,
      linked_finance_line_ids // Stringified array of IDs
    } = req.body;

    if (!account_id || !amount || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let financeLineIds = [];
    if (linked_finance_line_ids) {
        try {
            financeLineIds = JSON.parse(linked_finance_line_ids);
        } catch (e) {
            financeLineIds = linked_finance_line_ids.split(',').map(id => parseInt(id));
        }
    }

    const proofFile = req.file ? '/uploads/proofs/' + req.file.filename : null;
    const accMap = await ledgerService.getAccountMap();
    const val = parseFloat(amount);

    await client.query('BEGIN');

    // Create Transaction Record
    const transRes = await client.query(
      `INSERT INTO transactions 
        (transaction_date, description, reference_type, voucher_no, instrument, instrument_number, proof_file) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [date || new Date(), description || 'Balance Update', 'BALANCE_UPDATE', voucher_no, instrument, instrument_number, proofFile]
    );
    const transId = transRes.rows[0].id;

    let targetLineId;
    if (financeLineIds.length > 0) {
        // CASE: Moving funds from Finance to Balance
        // We need a Debit in Dealer Finance and a Credit in the target Balance Account
        
        // 1. Credit Target Account (Advance/Savings)
        const assetLineRes = await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [transId, account_id, user_id, 0, val]
        );
        targetLineId = assetLineRes.rows[0].id;

        // 2. Debit Dealer Finance from EACH contributing user
        // We query the linked lines to see who they belong to and what the amount was
        const sourceLinesRes = await client.query(
            'SELECT user_id, credit FROM transaction_lines WHERE id = ANY($1::int[])',
            [financeLineIds]
        );

        // Group by user_id to handle multiple entries from the same user
        const debitsByUser = {};
        sourceLinesRes.rows.forEach(row => {
            const uid = row.user_id;
            debitsByUser[uid] = (debitsByUser[uid] || 0) + parseFloat(row.credit);
        });

        for (const [contribUserId, contribAmount] of Object.entries(debitsByUser)) {
            await client.query(
                'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
                [transId, accMap.DEALER_FINANCE, contribUserId, contribAmount, 0]
            );
        }

        // 3. Link original Finance Credits to this new Balance Credit
        await client.query(
            'UPDATE transaction_lines SET linked_line_id = $1 WHERE id = ANY($2::int[])',
            [targetLineId, financeLineIds]
        );
    } else {
        // CASE: Normal manual balance update (not linked to finance)
        let assetLine, cashLine;
        if (type === 'add' || type === 'deposit' || type === 'Received') {
            assetLine = { account_id, user_id: user_id || null, debit: val, credit: 0 };
            cashLine = { account_id: accMap.CASH_BANK, debit: 0, credit: val };
        } else {
            assetLine = { account_id, user_id: user_id || null, debit: 0, credit: val };
            cashLine = { account_id: accMap.CASH_BANK, debit: val, credit: 0 };
        }

        await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
            [transId, assetLine.account_id, assetLine.user_id, assetLine.debit, assetLine.credit]
        );
        await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
            [transId, cashLine.account_id, null, cashLine.debit, cashLine.credit]
        );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Transaction created', transaction_id: transId });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// ... rest of file (adjust-deal, delete)
router.post('/adjust-deal', auth, adminAndAccountantOnly, async (req, res) => {
    const client = await db.connect();
    try {
      const { deal_id, customer_price, cost_price, date, notes } = req.body;
      if (!deal_id || !customer_price || !cost_price) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      const accMap = await ledgerService.getAccountMap();
      const certAccountId = 8; 
      await client.query('BEGIN');
      const transRes = await client.query(
        `INSERT INTO transactions (transaction_date, description, reference_type, reference_id) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [date || new Date(), notes || `Adjustment Form for Deal #${deal_id}`, 'ADJUSTMENT', deal_id]
      );
      const transId = transRes.rows[0].id;
      const dealRes = await client.query('SELECT dealer_id FROM deals WHERE id = $1', [deal_id]);
      const dealerId = dealRes.rows[0].dealer_id;
      await client.query(
        'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [transId, certAccountId, null, 0, cost_price]
      );
      await client.query(
        'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [transId, accMap.ACCOUNTS_RECEIVABLE, dealerId, 0, customer_price] 
      );
      await client.query(
        `INSERT INTO deal_adjustments (deal_id, transaction_id, customer_price, cost_price, adjustment_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [deal_id, transId, customer_price, cost_price, date || new Date(), notes]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: 'Adjustment recorded' });
    } catch (error) {
      await client.query('ROLLBACK');
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });
  
  router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
    try {
      const result = await db.query('DELETE FROM transactions WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ message: 'Transaction not found' });
      res.json({ message: 'Transaction deleted' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

module.exports = router;
