const db = require('../server/config/database');
require('dotenv').config();

async function run() {
  try {
    console.log('Clearing transaction and adjustment tables for testing...');
    
    // Disable triggers/constraints if necessary, but TRUNCATE CASCADE is usually better
    await db.query('TRUNCATE transaction_lines, transactions, deal_adjustments, payments RESTART IDENTITY CASCADE');
    
    console.log('Success! Tables cleared.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
