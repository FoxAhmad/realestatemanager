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
    console.log('Connected to Database. Deleting garbage users...');
    
    const emailsToDelete = [
        'byazam@uhcrm.com',
        'pereviousformbalance@uhcrm.com',
        'advance@uhcrm.com',
        'cadn@uhcrm.com',
        'dins@uhcrm.com',
        'cnchg@uhcrm.com',
        'unknowncertificatedealer@uhcrm.com',
        'bymurtaza@uhcrm.com',
        'zahidkaleemumair@uhcrm.com',
        'azamkhan@uhcrm.com',
        'murtazaazam@uhcrm.com',
        'azam@uhcrm.com',
        'azamyounus@uhcrm.com',
        'unknowndealer@uhcrm.com',
        'dealer_1781016485781_891@uhcrm.com'
    ];

    // Begin transaction for safety
    await client.query('BEGIN');

    for (const email of emailsToDelete) {
      console.log(`Deleting user with email: ${email}`);
      const res = await client.query(`DELETE FROM users WHERE email = $1 RETURNING id`, [email]);
      if (res.rowCount > 0) {
        console.log(`Successfully deleted ${res.rowCount} row(s) for ${email}`);
      } else {
        console.log(`User ${email} not found.`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Garbage users removed!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during user cleanup:', error.message);
  } finally {
    await client.end();
  }
}

run();
