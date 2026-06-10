const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');
const ledgerService = require('../services/ledgerService');
const supabase = require('../config/supabase');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
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
      SELECT t.*, tl.debit, tl.credit, tl.quantity, tl.plot_info, tl.customer_info, u.name as user_name, tl.user_id, c.name as customer_name, tl.customer_id, a.name as account_name,
             da.customer_price, da.cost_price, da.id as adjustment_id, tl.id as line_id,
             (
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                    'id', f_t.id,
                    'date', f_t.transaction_date,
                    'description', f_t.description,
                    'amount', f_tl.credit,
                    'proof_file', f_t.proof_file,
                    'user_name', f_u.name,
                    'customer_name', f_c.name
                ))
                FROM transaction_lines f_tl
                JOIN transactions f_t ON f_tl.transaction_id = f_t.id
                LEFT JOIN users f_u ON f_tl.user_id = f_u.id
                LEFT JOIN customers f_c ON f_tl.customer_id = f_c.id
                WHERE f_tl.linked_line_id = tl.id
             ) as linked_entries
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      JOIN accounts a ON tl.account_id = a.id
      LEFT JOIN users u ON tl.user_id = u.id
      LEFT JOIN customers c ON tl.customer_id = c.id
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
      linked_finance_line_ids, // Stringified array of IDs
      quantity, plot_info, customer_info
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

    let proofFile = null;
    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('proofs')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
        
      if (uploadError) {
        throw new Error('Failed to upload proof image: ' + uploadError.message);
      }
      
      const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(fileName);
      proofFile = publicUrlData.publicUrl;
    }
    const accMap = await ledgerService.getAccountMap();
    const val = parseFloat(amount);

    // Get account type to determine Debit/Credit logic
    const accRes = await client.query('SELECT type FROM accounts WHERE id = $1', [account_id]);
    const accType = accRes.rows[0]?.type || 'Asset';

    await client.query('BEGIN');

    // Create Transaction Record
    const transRes = await client.query(
      `INSERT INTO transactions 
        (transaction_date, description, reference_type, voucher_no, instrument, instrument_number, proof_file) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [date ? new Date(date) : new Date(), description || 'Balance Update', 'BALANCE_UPDATE', voucher_no, instrument, instrument_number, proofFile]
    );
    const transId = transRes.rows[0].id;

    let targetLineId;
    if (financeLineIds.length > 0) {
        // CASE: Moving funds from Finance to Balance
        // We need a Debit in Dealer Finance and a Credit in the target Balance Account
        
        // 1. Credit Target Account (Advance/Savings)
        const assetLineRes = await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit, quantity, plot_info, customer_info) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [transId, account_id, user_id, 0, val, quantity || 1, plot_info || null, customer_info || null]
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
        const isDeposit = type === 'add' || type === 'deposit' || type === 'Received';
        
        if (accType === 'Asset') {
            if (isDeposit) {
                assetLine = { account_id, user_id: user_id || null, debit: val, credit: 0 };
                cashLine = { account_id: accMap.CASH_BANK, debit: 0, credit: val };
            } else {
                assetLine = { account_id, user_id: user_id || null, debit: 0, credit: val };
                cashLine = { account_id: accMap.CASH_BANK, debit: val, credit: 0 };
            }
        } else {
            // Liability logic (e.g. Dealer Balance)
            if (isDeposit) {
                // Deposit increases liability (Credit)
                assetLine = { account_id, user_id: user_id || null, debit: 0, credit: val };
                cashLine = { account_id: accMap.CASH_BANK, debit: val, credit: 0 };
            } else {
                // Deduction decreases liability (Debit)
                assetLine = { account_id, user_id: user_id || null, debit: val, credit: 0 };
                cashLine = { account_id: accMap.CASH_BANK, debit: 0, credit: val };
            }
        }

        await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit, quantity, plot_info, customer_info) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [transId, assetLine.account_id, assetLine.user_id, assetLine.debit, assetLine.credit, quantity || 1, plot_info || null, customer_info || null]
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
      const { deal_id, customer_price, cost_price, quantity, date, notes } = req.body;
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
      
      // Fetch deal details for the ledger
      const dealDetailsRes = await client.query(`
        SELECT d.dealer_id, d.plot_info, c.name as customer_name,
               ARRAY_AGG(p.plot_number) as plot_numbers
        FROM deals d
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN deal_plots dp ON d.id = dp.deal_id
        LEFT JOIN inventory_plots p ON dp.plot_id = p.id
        WHERE d.id = $1
        GROUP BY d.id, c.id
      `, [deal_id]);
      
      const dealInfo = dealDetailsRes.rows[0];
      const dealerId = dealInfo?.dealer_id;
      const plotNumbers = dealInfo?.plot_numbers?.filter(n => n)?.join(', ') || dealInfo?.plot_info;
      const customerName = dealInfo?.customer_name;
      
      const userId = req.body.user_id || dealerId; // Allow overriding the dealer for the certificate deduction

      await client.query(
        'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit, quantity, plot_info, customer_info) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [transId, certAccountId, userId, cost_price, 0, quantity || 1, plotNumbers, customerName] // DEBIT for deduction from Liability
      );
      await client.query(
        'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [transId, accMap.ACCOUNTS_RECEIVABLE, dealerId, 0, customer_price] // CREDIT for reduction of Asset
      );
      await client.query(
        `INSERT INTO deal_adjustments (deal_id, transaction_id, customer_price, cost_price, quantity, adjustment_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [deal_id, transId, customer_price, cost_price, quantity || 1, date || new Date(), notes]
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

  /**
   * Update a balance transaction (Text fields and Proof only)
   */
  router.put('/:id', auth, adminAndAccountantOnly, upload.single('proof_file'), async (req, res) => {
    try {
      const { date, description, voucher_no, instrument, instrument_number } = req.body;
      
      let queryArgs = [
        date ? new Date(date) : new Date(), 
        description, 
        voucher_no, 
        instrument, 
        instrument_number, 
        req.params.id
      ];
      let queryStr = `
        UPDATE transactions 
        SET transaction_date = $1, description = $2, voucher_no = $3, instrument = $4, instrument_number = $5
      `;

      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('proofs')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
          });
          
        if (uploadError) {
          throw new Error('Failed to upload proof image: ' + uploadError.message);
        }
        
        const { data: publicUrlData } = supabase.storage.from('proofs').getPublicUrl(fileName);
        const proofFile = publicUrlData.publicUrl;
        
        queryStr += `, proof_file = $7`;
        queryArgs.push(proofFile);
      }

      queryStr += ` WHERE id = $6 RETURNING *`;

      const result = await db.query(queryStr, queryArgs);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      res.json({ message: 'Transaction updated', transaction: result.rows[0] });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
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
