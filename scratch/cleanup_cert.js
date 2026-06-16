require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  try {
    await client.query('BEGIN');
    const d1 = await client.query("DELETE FROM transaction_lines WHERE transaction_id IN (SELECT id FROM transactions WHERE description LIKE '%NT Certificate Advance — %')");
    const d2 = await client.query("DELETE FROM transactions WHERE description LIKE '%NT Certificate Advance — %'");
    const d3 = await client.query("DELETE FROM customers WHERE name IN ('AZAM KHAN', 'ADIL SIRAJ', 'GHULAM MURTAZA', 'ZAIN-UL-ARFEEN', 'HAFIZ SHAHID', 'ASIF', 'UMAR KHAN')");
    
    // Also create Asif if he doesn't exist
    let asifId;
    const res = await client.query("SELECT id FROM users WHERE name ILIKE '%Asif%'");
    if (res.rows.length > 0) {
      asifId = res.rows[0].id;
    } else {
      const iRes = await client.query("INSERT INTO users (name, email, password, role) VALUES ('Asif', 'asif@union.com', 'password', 'dealer') RETURNING id");
      asifId = iRes.rows[0].id;
      console.log('Created Asif with ID:', asifId);
    }

    console.log('Deleted lines:', d1.rowCount);
    console.log('Deleted transactions:', d2.rowCount);
    console.log('Deleted customers:', d3.rowCount);
    await client.query('COMMIT');
  } catch(e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    await client.end();
  }
}
run();
