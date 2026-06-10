const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const { rows } = await pool.query("SELECT id, name, email, role FROM users");
  console.log(rows);
  pool.end();
}

main();
