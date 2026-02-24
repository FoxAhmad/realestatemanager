const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function verify() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'CRM-DB',
    port: process.env.DB_PORT || 5432,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if dealer_id column exists
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deals' AND column_name = 'dealer_id'
    `);

    if (result.rows.length > 0) {
      console.log('✅ dealer_id column exists in deals table');
    } else {
      console.log('❌ dealer_id column does NOT exist in deals table');
      
      // Check if agent_id still exists
      const agentCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'deals' AND column_name = 'agent_id'
      `);
      
      if (agentCheck.rows.length > 0) {
        console.log('⚠️  agent_id still exists - migration may have failed');
      }
    }

    // Check user roles
    const rolesResult = await client.query(`
      SELECT DISTINCT role FROM users
    `);
    console.log('Current user roles:', rolesResult.rows.map(r => r.role));

    await client.end();
  } catch (error) {
    console.error('Verification error:', error);
    await client.end();
    process.exit(1);
  }
}

verify();

