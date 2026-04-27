const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanFinanceData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Cleaning finance and balance data...');

    // 1. Delete deal adjustments (linked to transactions)
    await client.query('DELETE FROM deal_adjustments');
    console.log('Deleted deal_adjustments');

    // 2. Clear linked_line_id references to avoid FK issues during deletion if any
    await client.query('UPDATE transaction_lines SET linked_line_id = NULL');
    console.log('Reset linked_line_id references');

    // 3. Delete transaction lines
    // We target lines for accounts 3, 4, 5, 8, 9 and 1, 2 if they are part of these transactions
    // Actually, cleaning ALL transactions is usually what is meant by "clean finance data" 
    // unless we want to keep deals. But deal payments are also transactions.

    await client.query('DELETE FROM transaction_lines');
    console.log('Deleted transaction_lines');

    // 4. Delete transactions
    await client.query('DELETE FROM transactions');
    console.log('Deleted transactions');

    // 5. Reset deal statuses if they were marked as 'deal_done' based on these transactions?
    // User didn't ask for this, so we leave deals alone.

    await client.query('COMMIT');
    console.log('Database cleaned successfully!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.log('Error cleaning database:', e);
  } finally {
    client.release();
    process.exit();
  }
}

cleanFinanceData();
