const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const connectionConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'uh_crm',
        port: process.env.DB_PORT || 5432,
      };

  const client = new Client(connectionConfig);

  try {
    await client.connect();
    console.log('Connected to Database. Proceeding with cleanup of ALL financial transactions...');
    
    // Begin transaction for safety
    await client.query('BEGIN');

    // Truncate the transactions table. 
    // CASCADE will automatically delete rows in transaction_lines and deal_adjustments that depend on these transactions.
    console.log('Truncating transactions, transaction_lines, and deal_adjustments tables...');
    await client.query('TRUNCATE TABLE transactions CASCADE');

    // Also reset sequence counters so new transactions start from ID 1
    console.log('Resetting sequences...');
    await client.query('ALTER SEQUENCE transactions_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE transaction_lines_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE deal_adjustments_id_seq RESTART WITH 1');

    await client.query('COMMIT');
    console.log('✅ Cleanup complete! All financial records and ledger entries have been permanently removed.');
    console.log('Your deals, inventory, users, and customers remain intact.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during cleanup:', error.message);
  } finally {
    await client.end();
  }
}

run();
