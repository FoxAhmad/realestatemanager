const db = require('../server/config/database');

async function verify() {
  try {
    // Check deal_adjustments columns
    const columns = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deal_adjustments'
    `);
    console.log('Columns in deal_adjustments:', columns.rows.map(r => r.column_name));

    // Check app_settings
    const settings = await db.query(`
      SELECT * FROM app_settings 
      WHERE setting_key IN ('ADJUSTMENT_FORM_DEFAULT_COST', 'ADJUSTMENT_FORM_CUSTOMER_VALUE')
    `);
    console.log('Settings:', settings.rows);

    // Check account types
    const accounts = await db.query(`
      SELECT id, name, type FROM accounts 
      WHERE id IN (3, 4, 8)
    `);
    console.log('Account Types:', accounts.rows);

    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err);
    process.exit(1);
  }
}

verify();
