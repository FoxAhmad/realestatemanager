const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');
const db = require('../config/database');
const supabase = require('../config/supabase');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all exchanges
router.get('/', auth, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'accountant' && !req.query.target_user_id) {
      result = await db.query(`
        SELECT de.*, 
               s.name as sender_name,
               r.name as receiver_name
        FROM dealer_exchanges de
        INNER JOIN users s ON de.sender_id = s.id
        INNER JOIN users r ON de.receiver_id = r.id
        ORDER BY de.exchange_date DESC, de.created_at DESC
      `);
    } else {
      const targetUserId = (req.user.role === 'accountant' && req.query.target_user_id)
        ? parseInt(req.query.target_user_id)
        : req.user.id;

      // Admin, Dealers, or Accountant masquerading see only target's exchanges
      result = await db.query(`
        SELECT de.*, 
               s.name as sender_name,
               r.name as receiver_name
        FROM dealer_exchanges de
        INNER JOIN users s ON de.sender_id = s.id
        INNER JOIN users r ON de.receiver_id = r.id
        WHERE de.sender_id = $1 OR de.receiver_id = $1
        ORDER BY de.exchange_date DESC, de.created_at DESC
      `, [targetUserId]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get selectable peers (other dealers and admins)
router.get('/peers', auth, async (req, res) => {
  try {
    const targetUserId = (req.user.role === 'accountant' && req.query.target_user_id)
      ? parseInt(req.query.target_user_id)
      : req.user.id;

    const result = await db.query(`
      SELECT id, name, role 
      FROM users 
      WHERE role IN ('dealer', 'admin') AND id != $1
      ORDER BY name ASC
    `, [targetUserId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get balances and ledger account balances
router.get('/balances', auth, async (req, res) => {
  try {
    const targetUserId = (req.user.role === 'accountant' && req.query.target_user_id)
      ? parseInt(req.query.target_user_id)
      : req.user.id;

    // Balances with other dealers
    let peerBalancesResult;
    if ((req.user.role === 'accountant' || req.user.role === 'admin') && !req.query.target_user_id) {
       // Return net balance for all unique PAIRS of dealers/admins
       peerBalancesResult = await db.query(`
         SELECT 
           u1.id as party1_id, u1.name as party1_name, u1.role as party1_role,
           u2.id as party2_id, u2.name as party2_name, u2.role as party2_role,
           SUM(CASE WHEN de.sender_id = u1.id THEN de.amount ELSE 0 END) as sent_amount,
           SUM(CASE WHEN de.receiver_id = u1.id THEN de.amount ELSE 0 END) as received_amount,
           (
             SUM(CASE WHEN de.sender_id = u1.id THEN de.amount ELSE 0 END) -
             SUM(CASE WHEN de.receiver_id = u1.id THEN de.amount ELSE 0 END)
           ) as net_balance
         FROM dealer_exchanges de
         JOIN users u1 ON LEAST(de.sender_id, de.receiver_id) = u1.id
         JOIN users u2 ON GREATEST(de.sender_id, de.receiver_id) = u2.id
         GROUP BY party1_id, party1_name, party1_role, party2_id, party2_name, party2_role
         ORDER BY u1.name, u2.name
       `);
    } else {
      // Calculate peer balances for target user - SUBJECT CENTRIC (Sent = Sent BY target)
      peerBalancesResult = await db.query(`
         SELECT u.id as peer_id, u.name as peer_name, u.role as peer_role,
           COALESCE(
             (SELECT SUM(amount) FROM dealer_exchanges WHERE sender_id = $1 AND receiver_id = u.id)
           , 0) as sent_amount,
           COALESCE(
             (SELECT SUM(amount) FROM dealer_exchanges WHERE sender_id = u.id AND receiver_id = $1)
           , 0) as received_amount,
           (
             COALESCE((SELECT SUM(amount) FROM dealer_exchanges WHERE sender_id = $1 AND receiver_id = u.id), 0) -
             COALESCE((SELECT SUM(amount) FROM dealer_exchanges WHERE sender_id = u.id AND receiver_id = $1), 0)
           ) as net_balance
         FROM users u
         WHERE u.role IN ('dealer', 'admin') AND u.id != $1
         ORDER BY u.name
       `, [targetUserId]);
    }

    let ledgerBalances = {};
    // If admin or accountant, fetch main 3 accounts
    if (req.user.role === 'admin' || req.user.role === 'accountant') {
      const getBalance = async (accName) => {
        const queryRes = await db.query(`
          SELECT
            a.type,
            COALESCE(SUM(tl.debit), 0) as d,
            COALESCE(SUM(tl.credit), 0) as c
          FROM accounts a
          LEFT JOIN transaction_lines tl ON tl.account_id = a.id
          WHERE a.name = $1
          GROUP BY a.type
        `, [accName]);

        if (queryRes.rows.length === 0) return 0;
        const { type, d, c } = queryRes.rows[0];

        if (type === 'Asset' || type === 'Expense') {
          return parseFloat(d) - parseFloat(c);
        } else {
          return parseFloat(c) - parseFloat(d);
        }
      };

      ledgerBalances = {
        dealerAdvances: await getBalance('Dealer Advances'),
        savingsDeposits: await getBalance('Savings Deposits'),
        advanceForCertificate: await getBalance('Advance for Certificate'),
        dealerFinanceBreakdown: (await db.query(`
          SELECT u.name, 
                 COALESCE(SUM(tl.credit) - SUM(tl.debit), 0) as balance
          FROM users u
          JOIN transaction_lines tl ON tl.user_id = u.id
          JOIN accounts a ON tl.account_id = a.id
          WHERE a.name = 'Dealer Finance'
          GROUP BY u.id, u.name
          HAVING COALESCE(SUM(tl.credit) - SUM(tl.debit), 0) != 0
          ORDER BY balance DESC
        `)).rows
      };
    }

    res.json({
      peerBalances: peerBalancesResult.rows,
      ledgerBalances
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new mutual exchange
router.post('/', auth, upload.single('proof_file'), async (req, res) => {
  try {
    let { receiver_id, amount, exchange_date, detail, direction, override_sender_id } = req.body;

    // For direction logic: 'send' means primary is sender. 'receive' means primary is receiver.
    let baseUserId = (req.user.role === 'accountant' && override_sender_id)
      ? parseInt(override_sender_id)
      : req.user.id;

    let senderId = baseUserId;
    let recipientId = receiver_id;

    if (direction === 'receive') {
      senderId = receiver_id;
      recipientId = baseUserId;
    }

    if (!receiver_id || !amount || !exchange_date) {
      return res.status(400).json({ message: 'Missing required fields' });
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

    const result = await db.query(`
      INSERT INTO dealer_exchanges (sender_id, receiver_id, amount, exchange_date, detail, proof_file)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [senderId, recipientId, amount, exchange_date, detail || null, proofFile]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
