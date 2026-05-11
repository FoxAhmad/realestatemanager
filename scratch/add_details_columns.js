const db = require('../server/config/database');
require('dotenv').config();

async function run() {
  try {
    console.log('Adding details columns to transaction_lines...');
    await db.query(`
      ALTER TABLE transaction_lines 
      ADD COLUMN IF NOT EXISTS plot_info TEXT,
      ADD COLUMN IF NOT EXISTS customer_info TEXT
    `);
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
