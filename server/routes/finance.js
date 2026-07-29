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

// Get finance summary
router.get('/summary', auth, async (req, res) => {
  try {
    let result;
    const isManagement = req.user.role === 'admin' || req.user.role === 'accountant';
    
    const query = `
      SELECT 
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.sale_price ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.profit ELSE 0 END), 0) as total_profit,
        COUNT(CASE WHEN d.status = 'deal_done' THEN 1 END) as completed_deals,
        COUNT(CASE WHEN d.status = 'in_progress' THEN 1 END) as active_deals
      FROM deals d
      ${isManagement ? '' : 'WHERE d.dealer_id = $1'}
    `;
    
    result = await db.query(query, isManagement ? [] : [req.user.id]);
    
    // Get current Dealer Finance balance
    const accMap = await ledgerService.getAccountMap();
    const balance = await ledgerService.calculateBalance(accMap.DEALER_FINANCE, isManagement ? null : req.user.id);

    res.json({
        ...result.rows[0],
        dealer_finance_balance: balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Finance Entries (Ledger)
router.get('/entries', auth, async (req, res) => {
    try {
        const { userId, agencyId, customerId, unlinkedOnly } = req.query;
        const accMap = await ledgerService.getAccountMap();
        const isManagement = req.user.role === 'admin' || req.user.role === 'accountant';
        
        let query;
        let params = [];

        if (customerId) {
            query = `
                SELECT t.*, tl.debit, tl.credit, c.name as user_name, tl.customer_id as user_id, tl.id as line_id,
                       tl.project_id, bp.name as project_name, tl.linked_line_id
                FROM transactions t
                JOIN transaction_lines tl ON t.id = tl.transaction_id
                LEFT JOIN customers c ON tl.customer_id = c.id
                LEFT JOIN balance_projects bp ON tl.project_id = bp.id
                WHERE tl.account_id = $1 AND tl.customer_id = $2
            `;
            params = [accMap.ADVANCE_FOR_CERTIFICATE, customerId];
        } else if (agencyId) {
            query = `
                SELECT t.*, tl.debit, tl.credit, a.name as user_name, tl.agency_id as user_id, tl.id as line_id,
                       tl.project_id, bp.name as project_name, tl.linked_line_id
                FROM transactions t
                JOIN transaction_lines tl ON t.id = tl.transaction_id
                LEFT JOIN agencies a ON tl.agency_id = a.id
                LEFT JOIN balance_projects bp ON tl.project_id = bp.id
                WHERE tl.account_id = $1 AND tl.agency_id = $2
            `;
            params = [accMap.ADVANCE_FOR_CERTIFICATE, agencyId];
        } else {
            let targetUserId = req.user.id;
            if (isManagement && userId) {
                targetUserId = userId;
            }

            query = `
                SELECT t.*, tl.debit, tl.credit, u.name as user_name, tl.user_id, tl.id as line_id,
                       tl.project_id, bp.name as project_name, tl.linked_line_id
                FROM transactions t
                JOIN transaction_lines tl ON t.id = tl.transaction_id
                LEFT JOIN users u ON tl.user_id = u.id
                LEFT JOIN balance_projects bp ON tl.project_id = bp.id
                WHERE tl.account_id = $1
            `;
            params = [accMap.DEALER_FINANCE];

            if (isManagement && !userId) {
                // Management seeing all
            } else {
                query += ` AND tl.user_id = $2`;
                params.push(targetUserId);
            }
        }

        if (unlinkedOnly === 'true') {
            query += ` AND tl.credit > 0 AND tl.linked_line_id IS NULL`;
        }

        query += ` ORDER BY t.transaction_date DESC, t.id DESC`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Add Finance Entry
router.post('/entries', auth, upload.single('proof_file'), async (req, res) => {
    const client = await db.connect();
    try {
        const { amount, type, description, date, voucher_no, instrument, instrument_number, target_type, agency_id, customer_id, project_id, balance_account_id } = req.body;
        const userId = req.body.user_id || req.user.id;
        // Optional: tag this entry with a Manage Balance project at creation time.
        // Note: for agency/customer entries the finance line posts to
        // ADVANCE_FOR_CERTIFICATE (8), which balanceProjects.js does sum. A project tag
        // on those lines therefore counts toward the project's certificate balance --
        // intentional, since it is a genuine account-8 movement for that project.
        const projId = project_id ? parseInt(project_id) : null;
        // Optional: also create the matching Manage Balance entry and link the two.
        const balanceAccountId = balance_account_id ? parseInt(balance_account_id) : null;

        if (!amount || !type) {
            return res.status(400).json({ message: 'Amount and type are required' });
        }

        const accMap = await ledgerService.getAccountMap();

        // Only these three accounts are valid transfer destinations (the Manage Balance tabs).
        const TRANSFER_ACCOUNTS = [accMap.DEALER_ADVANCES, accMap.SAVINGS_DEPOSITS, accMap.ADVANCE_FOR_CERTIFICATE];
        const isCreditEntry = type === 'add' || type === 'credit';

        if (balanceAccountId !== null) {
            if (!TRANSFER_ACCOUNTS.includes(balanceAccountId)) {
                return res.status(400).json({ message: 'Invalid balance account. Must be Dealer Advances, Advance for Certificate, or Savings Deposits.' });
            }
            if (!isCreditEntry) {
                return res.status(400).json({ message: 'Only credit entries can be transferred to a balance account.' });
            }
            if (target_type === 'agency' || target_type === 'customer') {
                return res.status(400).json({ message: 'Agency/customer entries cannot be auto-transferred to a balance account.' });
            }
        }
        const val = parseFloat(amount);
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

        await client.query('BEGIN');

        // Create Transaction Record
        const transRes = await client.query(
            `INSERT INTO transactions 
                (transaction_date, description, reference_type, voucher_no, instrument, instrument_number, proof_file) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [date || new Date(), description || 'Finance Entry', 'BALANCE_UPDATE', voucher_no, instrument, instrument_number, proofFile]
        );
        const transId = transRes.rows[0].id;

        // Determine Debit/Credit for DEALER_FINANCE or ADVANCE_FOR_CERTIFICATE (Liability Accounts)
        // Add (Credit) -> Increase Liability, Debit Cash
        // Use (Debit) -> Decrease Liability, Credit Cash
        
        let targetAccount = accMap.DEALER_FINANCE;
        let lineUserId = userId;
        let lineAgencyId = null;
        let lineCustomerId = null;

        if (target_type === 'agency' && agency_id) {
            targetAccount = accMap.ADVANCE_FOR_CERTIFICATE;
            lineUserId = null;
            lineAgencyId = agency_id;
        } else if (target_type === 'customer' && customer_id) {
            targetAccount = accMap.ADVANCE_FOR_CERTIFICATE;
            lineUserId = null;
            lineCustomerId = customer_id;
        }

        let financeLine, cashLine;
        if (type === 'add' || type === 'credit') {
            financeLine = { account_id: targetAccount, user_id: lineUserId, agency_id: lineAgencyId, customer_id: lineCustomerId, debit: 0, credit: val };
            cashLine = { account_id: accMap.CASH_BANK, user_id: null, agency_id: null, customer_id: null, debit: val, credit: 0 };
        } else {
            financeLine = { account_id: targetAccount, user_id: lineUserId, agency_id: lineAgencyId, customer_id: lineCustomerId, debit: val, credit: 0 };
            cashLine = { account_id: accMap.CASH_BANK, user_id: null, agency_id: null, customer_id: null, debit: 0, credit: val };
        }

        // Insert Lines
        // The project tag goes on the finance line only — the cash/bank side stays unallocated.
        const financeLineRes = await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, agency_id, customer_id, debit, credit, project_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [transId, financeLine.account_id, financeLine.user_id, financeLine.agency_id, financeLine.customer_id, financeLine.debit, financeLine.credit, projId]
        );
        const financeLineId = financeLineRes.rows[0].id;

        await client.query(
            'INSERT INTO transaction_lines (transaction_id, account_id, user_id, agency_id, customer_id, debit, credit) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [transId, cashLine.account_id, cashLine.user_id, cashLine.agency_id, cashLine.customer_id, cashLine.debit, cashLine.credit]
        );

        // ── Optional: create the matching Manage Balance entry and link it ──────────
        // This is the one-step version of the manual flow in balanceTransactions.js:
        // a separate balance transaction that credits the chosen account and debits
        // Dealer Finance, with the finance line pointing at the new balance line.
        // Keeping them as two transactions means either side can be deleted
        // independently, exactly as the manual flow behaves.
        let balanceTransactionId = null;
        if (balanceAccountId !== null) {
            let quantity = 1;
            if (balanceAccountId === accMap.ADVANCE_FOR_CERTIFICATE) {
                const costRes = await client.query(
                    "SELECT setting_value FROM app_settings WHERE setting_key = 'ADJUSTMENT_FORM_DEFAULT_COST'"
                );
                const unitCost = parseFloat(costRes.rows[0]?.setting_value) || 0;
                if (unitCost > 0) quantity = Math.round(val / unitCost) || 1;
            }

            const balTransRes = await client.query(
                `INSERT INTO transactions
                    (transaction_date, description, reference_type, voucher_no, instrument, instrument_number, proof_file)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [
                    date || new Date(),
                    `Transfer from Finance: ${description || 'Finance Entry'}`,
                    'BALANCE_UPDATE',
                    voucher_no, instrument, instrument_number, proofFile
                ]
            );
            balanceTransactionId = balTransRes.rows[0].id;

            // Credit the chosen balance account (tagged with the project, if any)
            const balLineRes = await client.query(
                'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit, quantity, project_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [balanceTransactionId, balanceAccountId, lineUserId, 0, val, quantity, projId]
            );
            const balanceLineId = balLineRes.rows[0].id;

            // Debit Dealer Finance so the wallet nets to zero for this movement
            await client.query(
                'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
                [balanceTransactionId, accMap.DEALER_FINANCE, lineUserId, val, 0]
            );

            // Link the finance line to the new balance line
            await client.query(
                'UPDATE transaction_lines SET linked_line_id = $1 WHERE id = $2',
                [balanceLineId, financeLineId]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: balanceTransactionId ? 'Entry recorded and linked to balance account' : 'Entry recorded',
            transaction_id: transId,
            balance_transaction_id: balanceTransactionId
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
        client.release();
    }
});

// Get monthly profit breakdown
router.get('/monthly', auth, async (req, res) => {
  try {
    let result;
    const isManagement = req.user.role === 'admin' || req.user.role === 'accountant';
    
    const query = `
      SELECT 
        DATE_TRUNC('month', d.updated_at) as month,
        SUM(d.sale_price) as revenue,
        SUM(d.profit) as profit,
        COUNT(*) as deals_count
      FROM deals d
      WHERE d.status = 'deal_done' ${isManagement ? '' : 'AND d.dealer_id = $1'}
      GROUP BY DATE_TRUNC('month', d.updated_at)
      ORDER BY month DESC
      LIMIT 12
    `;
    
    result = await db.query(query, isManagement ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salesperson-wise finance (Admin only)
router.get('/by-dealer', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const accMap = await ledgerService.getAccountMap();
    const result = await db.query(`
      SELECT 
        u.id as dealer_id,
        u.name as dealer_name,
        u.email as dealer_email,
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.sale_price ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.profit ELSE 0 END), 0) as total_profit,
        COUNT(CASE WHEN d.status = 'deal_done' THEN 1 END) as completed_deals,
        (
          SELECT COALESCE(SUM(tl.credit) - SUM(tl.debit), 0)
          FROM transaction_lines tl
          WHERE tl.account_id = $1 AND tl.user_id = u.id
        ) as wallet_balance
      FROM users u
      LEFT JOIN deals d ON u.id = d.dealer_id
      WHERE u.role = 'dealer'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_revenue DESC
    `, [accMap.DEALER_FINANCE]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
