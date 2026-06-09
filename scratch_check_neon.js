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
    const query = `
      SELECT t.*, tl.debit, tl.credit, tl.quantity, tl.plot_info, tl.customer_info, u.name as user_name, tl.user_id, a.name as account_name,
             da.customer_price, da.cost_price, da.id as adjustment_id, tl.id as line_id
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      JOIN accounts a ON tl.account_id = a.id
      LEFT JOIN users u ON tl.user_id = u.id
      LEFT JOIN deal_adjustments da ON t.id = da.transaction_id
      WHERE tl.account_id = $1
    `;
    const lines = await client.query(query, [3]);
    console.log(`API Query Rows: ${lines.rows.length}`);
    if (lines.rows.length > 0) {
      console.log('Sample Line:', lines.rows[0]);
    }
  } catch (err) {
    console.error("Error connecting or querying:", err);
  } finally {
    await client.end();
  }
}
run();
