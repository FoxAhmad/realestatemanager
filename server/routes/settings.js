const express = require('express');
const router = express.Router();
const { auth, adminAndAccountantOnly } = require('../middleware/auth');
const db = require('../config/database');

// Get all settings
router.get('/', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM app_settings ORDER BY setting_key ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update a setting
router.put('/:key', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ message: 'Setting value is required' });
    }

    const result = await db.query(
      'UPDATE app_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2 RETURNING *',
      [value.toString(), req.params.key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
