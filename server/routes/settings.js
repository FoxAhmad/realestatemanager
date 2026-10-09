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

// Create or update a setting. Keys are upper-case letters, digits and underscores only.
router.put('/:key', auth, adminAndAccountantOnly, async (req, res) => {
  try {
    const { value, description } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Setting value is required' });
    }
    if (!/^[A-Z][A-Z0-9_]{1,99}$/.test(req.params.key)) {
      return res.status(400).json({ message: 'Invalid setting key' });
    }

    const result = await db.query(
      `INSERT INTO app_settings (setting_key, setting_value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.params.key, value.toString(), description || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
