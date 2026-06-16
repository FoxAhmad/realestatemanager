require('dotenv').config();
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
c.connect().then(async () => {
  const r = await c.query("SELECT id, name FROM customers WHERE name ILIKE '%AZAM%' OR name ILIKE '%ADIL%' OR name ILIKE '%MURTAZA%' OR name ILIKE '%ZAIN%' OR name ILIKE '%HAFIZ%' OR name ILIKE '%ASIF%' OR name ILIKE '%UMAR%'");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
});
