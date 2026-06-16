const express = require('express');
const router = express.Router();
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

/**
 * GET /api/balance-projects
 * List all projects with their balance summary across accounts 3 & 8.
 * Accessible to all authenticated users (dealers can view).
 */
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        bp.id,
        bp.name,
        bp.description,
        bp.created_at,
        u.name AS created_by_name,
        COALESCE(SUM(CASE WHEN tl.account_id = 3 THEN (tl.credit - tl.debit) ELSE 0 END), 0) AS advances_balance,
        COALESCE(SUM(CASE WHEN tl.account_id = 8 THEN (tl.credit - tl.debit) ELSE 0 END), 0) AS certificate_balance,
        COALESCE(SUM(tl.credit - tl.debit), 0) AS total_balance,
        COUNT(DISTINCT tl.id) AS entry_count,
        COUNT(DISTINCT CASE WHEN tl.account_id = 3 THEN tl.id END) AS advances_count,
        COUNT(DISTINCT CASE WHEN tl.account_id = 8 THEN tl.id END) AS certificate_count
      FROM balance_projects bp
      LEFT JOIN users u ON bp.created_by = u.id
      LEFT JOIN transaction_lines tl ON tl.project_id = bp.id AND tl.account_id IN (3, 8)
      GROUP BY bp.id, bp.name, bp.description, bp.created_at, u.name
      ORDER BY bp.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});


/**
 * GET /api/balance-projects/:id
 * Get a single project with full balance details.
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        bp.id,
        bp.name,
        bp.description,
        bp.created_at,
        u.name AS created_by_name,
        COALESCE(SUM(CASE WHEN tl.account_id = 3 THEN (tl.credit - tl.debit) ELSE 0 END), 0) AS advances_balance,
        COALESCE(SUM(CASE WHEN tl.account_id = 8 THEN (tl.credit - tl.debit) ELSE 0 END), 0) AS certificate_balance,
        COALESCE(SUM(tl.credit - tl.debit), 0) AS total_balance,
        COUNT(DISTINCT tl.id) AS entry_count
      FROM balance_projects bp
      LEFT JOIN users u ON bp.created_by = u.id
      LEFT JOIN transaction_lines tl ON tl.project_id = bp.id AND tl.account_id IN (3, 8)
      WHERE bp.id = $1
      GROUP BY bp.id, bp.name, bp.description, bp.created_at, u.name
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/balance-projects
 * Create a new project. Admin/accountant only.
 */
router.post('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }
    const result = await db.query(
      `INSERT INTO balance_projects (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * PUT /api/balance-projects/:id
 * Edit a project. Admin/accountant only.
 */
router.put('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }
    const result = await db.query(
      `UPDATE balance_projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [name.trim(), description || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * DELETE /api/balance-projects/:id
 * Delete a project. Only allowed if no transaction lines are linked to it.
 * Admin/accountant only.
 */
router.delete('/:id', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    // Check for linked entries
    const check = await db.query(
      'SELECT COUNT(*) FROM transaction_lines WHERE project_id = $1',
      [req.params.id]
    );
    if (parseInt(check.rows[0].count) > 0) {
      return res.status(400).json({
        message: 'Cannot delete project: it has existing balance entries. Remove or reassign entries first.'
      });
    }
    const result = await db.query(
      'DELETE FROM balance_projects WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
