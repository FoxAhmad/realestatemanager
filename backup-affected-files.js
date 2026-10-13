// Phase 0: copy every file the multi-tenant change touches into backups/pre-multitenant/ with a SHA-256 manifest.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILES = [
  'server/config/dbInit.js', 'server/config/database.js', 'server/index.js',
  'server/middleware/auth.js', 'server/services/ledgerService.js',
  ...fs.readdirSync('server/routes').filter(f => f.endsWith('.js')).map(f => `server/routes/${f}`),
  'server/scripts/reimport_union_town.js', 'server/scripts/cleanup_live_duplicates.js', 'server/scripts/verify_live_import.js',
  'migrate-live.js', 'import-certificates.js', 'import-nt-certificate-finance.js', 'migrate-excel-accounting.js',
  'cleanup-all.js', 'cleanup-transactions.js', 'delete-garbage-users.js', 'setup.js',
  'client/src/services/api.js', 'client/src/context/AuthContext.js', 'client/src/components/Layout.js',
  'client/src/components/Layout.css', 'client/src/App.js', 'client/src/pages/Login.js',
  'client/src/pages/Dealers.js', 'client/src/pages/Employees.js',
];

const root = path.join('backups', 'pre-multitenant');
if (fs.existsSync(path.join(root, 'MANIFEST.txt'))) { console.error('Backup already exists; refusing to overwrite.'); process.exit(1); }
const manifest = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) { console.error('MISSING', f); process.exit(1); }
  const dest = path.join(root, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
  const h = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  if (h !== crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')) { console.error('HASH MISMATCH', f); process.exit(1); }
  manifest.push(`${h}  ${f}`);
}
fs.writeFileSync(path.join(root, 'MANIFEST.txt'), manifest.join('\n') + '\n');
console.log(`Backed up ${FILES.length} files to ${root}`);
