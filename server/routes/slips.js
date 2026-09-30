const express = require('express');
const router = express.Router();
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

const SLIP_FIELDS = `
  slip_no, slip_date, deal_id, plot_number, block, size, referred_by,
  installment_amount, investment_value, form_qty, slip_owner, slip_status,
  given_to, given_date, notes
`;

// Get all slips
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*, c.name as customer_name, u.name as dealer_name
      FROM slips s
      LEFT JOIN deals d ON s.deal_id = d.id
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.dealer_id = u.id
      ORDER BY s.slip_date DESC, s.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create slip
router.post('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const {
      slip_no, slip_date, deal_id, plot_number, block, size, referred_by,
      installment_amount, investment_value, form_qty, slip_owner, slip_status,
      given_to, given_date, notes
    } = req.body;

    if (!slip_no || !slip_date) {
      return res.status(400).json({ message: 'Slip # and date are required' });
    }

    const result = await db.query(
      `INSERT INTO slips (${SLIP_FIELDS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        slip_no, slip_date, deal_id || null, plot_number || null, block || null, size || null,
        referred_by || null, installment_amount || 0, investment_value || 0, form_qty || 0,
        slip_owner || 'Universal Holdings', slip_status || 'available',
        given_to || null, given_date || null, notes || null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Pull existing receipt numbers from payments and adjustment forms that haven't
// been pulled in yet (idempotent - matched by source_type + source_id).
//
// Historically, forms were sometimes logged as a plain cash payment instead of
// a proper Adjustment Form (deal_adjustments), losing the form quantity/cost
// split. Those receipts are identifiable by their "CADN" voucher prefix, so for
// those: investment value = half the installment, and form qty is derived from
// the installment amount using the current per-form customer value setting.
router.post('/import', auth, adminAndAccountantOnly, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const settingsRes = await client.query(
      `SELECT setting_key, setting_value FROM app_settings WHERE setting_key = 'ADJUSTMENT_FORM_CUSTOMER_VALUE'`
    );
    const customerValue = parseFloat(settingsRes.rows[0]?.setting_value) || 40000;

    const paymentsRes = await client.query(`
      INSERT INTO slips (
        slip_no, slip_date, deal_id, source_type, source_id,
        plot_number, block, size, referred_by, installment_amount, investment_value, form_qty, notes
      )
      SELECT
        p.voucher_no, p.payment_date, p.deal_id, 'payment', p.id,
        plots.plot_number, plots.block, plots.size,
        COALESCE(ag.name, u.name), p.amount,
        CASE WHEN p.voucher_no ILIKE '%CADN%' THEN ROUND(p.amount / 2, 2) ELSE 0 END,
        CASE WHEN p.voucher_no ILIKE '%CADN%' THEN ROUND(p.amount / $1) ELSE 0 END,
        p.notes
      FROM payments p
      LEFT JOIN deals d ON p.deal_id = d.id
      LEFT JOIN agencies ag ON d.agency_id = ag.id
      LEFT JOIN users u ON d.dealer_id = u.id
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(ip.plot_number, ', ') as plot_number, MAX(ip.block) as block, MAX(ip.size) as size
        FROM deal_plots dp JOIN inventory_plots ip ON dp.plot_id = ip.id
        WHERE dp.deal_id = p.deal_id
      ) plots ON true
      WHERE p.voucher_no IS NOT NULL AND TRIM(p.voucher_no) <> ''
      ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
      RETURNING id
    `, [customerValue]);

    const adjustmentsRes = await client.query(`
      INSERT INTO slips (
        slip_no, slip_date, deal_id, source_type, source_id,
        plot_number, block, size, referred_by, installment_amount, investment_value, form_qty, notes
      )
      SELECT
        t.voucher_no, da.adjustment_date, da.deal_id, 'adjustment', da.id,
        plots.plot_number, plots.block, plots.size,
        COALESCE(ag.name, u.name), da.customer_price, da.cost_price, da.quantity, da.notes
      FROM deal_adjustments da
      JOIN transactions t ON da.transaction_id = t.id
      LEFT JOIN deals d ON da.deal_id = d.id
      LEFT JOIN agencies ag ON d.agency_id = ag.id
      LEFT JOIN users u ON d.dealer_id = u.id
      LEFT JOIN LATERAL (
        SELECT STRING_AGG(ip.plot_number, ', ') as plot_number, MAX(ip.block) as block, MAX(ip.size) as size
        FROM deal_plots dp JOIN inventory_plots ip ON dp.plot_id = ip.id
        WHERE dp.deal_id = da.deal_id
      ) plots ON true
      WHERE t.voucher_no IS NOT NULL AND TRIM(t.voucher_no) <> ''
      ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
      RETURNING id
    `);

    // Retroactively fix slips already pulled from a plain cash payment (before this
    // CADN rule existed, or from a previous import run) that are really forms.
    const fixedRes = await client.query(`
      UPDATE slips
      SET investment_value = ROUND(installment_amount / 2, 2),
          form_qty = ROUND(installment_amount / $1),
          updated_at = CURRENT_TIMESTAMP
      WHERE source_type = 'payment'
        AND slip_no ILIKE '%CADN%'
        AND (investment_value IS NULL OR investment_value = 0)
        AND installment_amount > 0
      RETURNING id
    `, [customerValue]);

    await client.query('COMMIT');
    res.json({
      message: 'Slips pulled successfully',
      pulled: paymentsRes.rowCount + adjustmentsRes.rowCount,
      fromPayments: paymentsRes.rowCount,
      fromAdjustments: adjustmentsRes.rowCount,
      fixed: fixedRes.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    client.release();
  }
});

// Update slip
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const {
      slip_no, slip_date, deal_id, plot_number, block, size, referred_by,
      installment_amount, investment_value, form_qty, slip_owner, slip_status,
      given_to, given_date, notes
    } = req.body;

    if (!slip_no || !slip_date) {
      return res.status(400).json({ message: 'Slip # and date are required' });
    }

    const result = await db.query(
      `UPDATE slips SET
         slip_no = $1, slip_date = $2, deal_id = $3, plot_number = $4, block = $5, size = $6,
         referred_by = $7, installment_amount = $8, investment_value = $9, form_qty = $10,
         slip_owner = $11, slip_status = $12, given_to = $13, given_date = $14, notes = $15,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $16 RETURNING *`,
      [
        slip_no, slip_date, deal_id || null, plot_number || null, block || null, size || null,
        referred_by || null, installment_amount || 0, investment_value || 0, form_qty || 0,
        slip_owner || 'Universal Holdings', slip_status || 'available',
        given_to || null, given_date || null, notes || null, req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Slip not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete slip
router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM slips WHERE id = $1', [req.params.id]);
    res.json({ message: 'Slip deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
