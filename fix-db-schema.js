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
    console.log('Connected to Database. Applying schema fixes...');
    
    await client.query(`ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1`);
    await client.query(`ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS plot_info TEXT`);
    await client.query(`ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS customer_info TEXT`);

    console.log('✅ Schema fixed! Columns quantity, plot_info, and customer_info have been added to transaction_lines.');
  } catch (error) {
    console.error('Error applying schema fixes:', error.message);
  } finally {
    await client.end();
  }
}

run();
