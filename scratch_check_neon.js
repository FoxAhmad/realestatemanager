const { Client } = require('pg');
require('dotenv').config();

async function run() {
  console.log("Using DATABASE_URL:", process.env.DATABASE_URL ? "Yes" : "No");
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Neon DB.");

    const query = `
      SELECT t.id, t.transaction_date, t.description, t.reference_type, tl.debit, tl.credit, tl.quantity, u.name as user_name
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      LEFT JOIN users u ON tl.user_id = u.id
      WHERE tl.account_id = 8
      ORDER BY tl.id DESC
      LIMIT 20
    `;
    const lines = await client.query(query);
    console.log(`Account 8 recent transactions:`, lines.rows);
    
    const sumQuery = \`SELECT SUM(credit - debit) as bal, SUM(quantity) as qty FROM transaction_lines WHERE account_id = 8\`;
    const sumRes = await client.query(sumQuery);
    console.log('Total balance raw sum:', sumRes.rows[0]);
    
  } catch (err) {
    console.error("Error connecting or querying:", err);
  } finally {
    await client.end();
  }
}
run();
