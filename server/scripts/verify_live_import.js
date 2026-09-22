// Read-only verification: confirms the Union Town import landed correctly on
// whichever API base IMPORT_API_URL points at. Run with:
//   IMPORT_API_URL=https://uh-crm-server.onrender.com/api IMPORT_ADMIN_EMAIL=... IMPORT_ADMIN_PASSWORD=... node server/scripts/verify_live_import.js

const API = process.env.IMPORT_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.IMPORT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.IMPORT_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set IMPORT_ADMIN_EMAIL and IMPORT_ADMIN_PASSWORD environment variables before running this script.');
  process.exit(1);
}

let TOKEN = null;
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
};

(async () => {
  const login = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  TOKEN = login.token;

  const projects = await api('GET', '/balance-projects');
  console.log('Projects:', projects.map((p) => p.name));

  const deals = await api('GET', '/deals');
  console.log(`Deals: ${deals.length}`);
  console.table(deals.map((d) => ({
    id: d.id, customer: d.customer_name, dealer: d.dealer_name,
    plot: d.plot_number, sale_price: d.sale_price, status: d.status,
  })));

  const inventory = await api('GET', '/inventory');
  console.log(`Inventory items: ${inventory.length}`);
  console.table(inventory.map((i) => ({ id: i.id, address: i.address, price: i.price, status: i.status })));
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
