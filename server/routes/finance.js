const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get finance summary (Salespersons see only their own, Admin sees all)
router.get('/summary', auth, async (req, res) => {
  try {
    let result;
    
    if (req.user.role === 'admin') {
      // Admin sees all finances
      result = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.sale_price ELSE 0 END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.profit ELSE 0 END), 0) as total_profit,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' AND DATE_TRUNC('month', d.updated_at) = DATE_TRUNC('month', CURRENT_DATE) THEN d.sale_price ELSE 0 END), 0) as monthly_revenue,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' AND DATE_TRUNC('month', d.updated_at) = DATE_TRUNC('month', CURRENT_DATE) THEN d.profit ELSE 0 END), 0) as monthly_profit,
          COUNT(CASE WHEN d.status = 'deal_done' THEN 1 END) as completed_deals,
          COUNT(CASE WHEN d.status = 'in_progress' THEN 1 END) as active_deals
        FROM deals d
      `);
    } else {
      // Salespersons see only their own finances
      result = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.sale_price ELSE 0 END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.profit ELSE 0 END), 0) as total_profit,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' AND DATE_TRUNC('month', d.updated_at) = DATE_TRUNC('month', CURRENT_DATE) THEN d.sale_price ELSE 0 END), 0) as monthly_revenue,
          COALESCE(SUM(CASE WHEN d.status = 'deal_done' AND DATE_TRUNC('month', d.updated_at) = DATE_TRUNC('month', CURRENT_DATE) THEN d.profit ELSE 0 END), 0) as monthly_profit,
          COUNT(CASE WHEN d.status = 'deal_done' THEN 1 END) as completed_deals,
          COUNT(CASE WHEN d.status = 'in_progress' THEN 1 END) as active_deals
        FROM deals d
        WHERE d.dealer_id = $1
      `, [req.user.id]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get monthly profit breakdown (Salespersons see only their own, Admin sees all)
router.get('/monthly', auth, async (req, res) => {
  try {
    let result;
    
    if (req.user.role === 'admin') {
      result = await db.query(`
        SELECT 
          DATE_TRUNC('month', d.updated_at) as month,
          SUM(d.sale_price) as revenue,
          SUM(d.profit) as profit,
          COUNT(*) as deals_count
        FROM deals d
        WHERE d.status = 'deal_done'
        GROUP BY DATE_TRUNC('month', d.updated_at)
        ORDER BY month DESC
        LIMIT 12
      `);
    } else {
      result = await db.query(`
        SELECT 
          DATE_TRUNC('month', d.updated_at) as month,
          SUM(d.sale_price) as revenue,
          SUM(d.profit) as profit,
          COUNT(*) as deals_count
        FROM deals d
        WHERE d.status = 'deal_done' AND d.dealer_id = $1
        GROUP BY DATE_TRUNC('month', d.updated_at)
        ORDER BY month DESC
        LIMIT 12
      `, [req.user.id]);
    }

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get salesperson-wise finance (Admin only)
router.get('/by-dealer', auth, adminOnly, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.id as dealer_id,
        u.name as dealer_name,
        u.email as dealer_email,
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.sale_price ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN d.status = 'deal_done' THEN d.profit ELSE 0 END), 0) as total_profit,
        COUNT(CASE WHEN d.status = 'deal_done' THEN 1 END) as completed_deals
      FROM users u
      LEFT JOIN deals d ON u.id = d.dealer_id
      WHERE u.role = 'dealer'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_revenue DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

