const db = require('../server/config/database');

async function fixTypes() {
  try {
    await db.query(`
      UPDATE accounts 
      SET type = 'Liability' 
      WHERE id IN (3, 4, 8)
    `);
    console.log('Account types updated to Liability');
    process.exit(0);
  } catch (err) {
    console.error('Update failed:', err);
    process.exit(1);
  }
}

fixTypes();
