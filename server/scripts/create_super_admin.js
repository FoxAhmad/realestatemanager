// Usage: node server/scripts/create_super_admin.js <email> <password> [name]
// Platform admin (no tenant): can create tenants and change plans via /api/tenants.
const bcrypt = require('bcryptjs');
const db = require('../config/database');

(async () => {
  const [email, password, name = 'Platform Admin'] = process.argv.slice(2);
  if (!email || !password) { console.error('Usage: node server/scripts/create_super_admin.js <email> <password> [name]'); process.exit(1); }
  await db.admin.query(
    `INSERT INTO users (name, email, password, role, tenant_id) VALUES ($1, $2, $3, 'super_admin', NULL)
     ON CONFLICT (email) DO NOTHING`,
    [name, email, await bcrypt.hash(password, 10)]
  );
  console.log('super_admin ready:', email);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
