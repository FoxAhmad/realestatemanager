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
    console.log('Connected to Database. Proceeding with FULL CLEANUP...');
    console.log('KEEPING: users, inventory, inventory_plots, accounts, app_settings');
    console.log('DELETING EVERYTHING ELSE...');
    
    // Begin transaction for safety
    await client.query('BEGIN');

    // List of tables to truncate. CASCADE ensures any dependent tables are also cleared.
    const tablesToClear = [
      'transactions',
      'deals',
      'customers',
      'leads',
      'dealer_exchanges',
      'inventory_requests',
      'inventory_plot_assignments',
      'inventory_payments'
    ];

    for (const table of tablesToClear) {
      console.log(`Truncating ${table} CASCADE...`);
      // Use CASCADE to automatically wipe deal_plots, deal_adjustments, agreements, payments, transaction_lines, lead_status_updates
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }

    // Reset sequences for the tables so IDs start at 1 again
    console.log('Resetting sequences...');
    const sequences = [
      'transactions_id_seq',
      'transaction_lines_id_seq',
      'deals_id_seq',
      'customers_id_seq',
      'leads_id_seq',
      'dealer_exchanges_id_seq',
      'inventory_requests_id_seq',
      'inventory_plot_assignments_id_seq',
      'inventory_payments_id_seq',
      'deal_plots_id_seq',
      'deal_adjustments_id_seq',
      'agreements_id_seq',
      'payments_id_seq',
      'lead_status_updates_id_seq'
    ];

    for (const seq of sequences) {
      try {
        await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
      } catch(e) {
        // Ignore if sequence doesn't exist
      }
    }

    await client.query('COMMIT');
    console.log('✅ FULL CLEANUP COMPLETE!');
    console.log('Your deals, transactions, customers, leads, and operational data have been permanently removed.');
    console.log('Your users and inventory data are perfectly intact.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during cleanup:', error.message);
  } finally {
    await client.end();
  }
}

run();
