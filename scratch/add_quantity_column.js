const db = require('../server/config/database');
require('dotenv').config();

async function run() {
  try {
    console.log('Adding quantity column to transaction_lines...');
    await db.query('ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1');
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
