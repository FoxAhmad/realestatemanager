const { Client } = require('pg');
const xlsx = require('xlsx');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Account ID Mappings based on dbInit.js
const ACCOUNTS = {
  CASH_BANK: 1,
  DEALER_ADVANCES: 3,
  ADVANCE_FOR_CERTIFICATE: 8,
  DEALER_FINANCE: 9
};

// Excel Serial Date to JS Date conversion
function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return new Date();
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  // Add 1 day to compensate for Excel leap year bug
  date_info.setDate(date_info.getDate() + 1);
  return date_info;
}

// Convert common Excel representation to proper string/number
function cleanString(str) {
  if (!str) return null;
  return str.toString().trim();
}

async function getOrCreateDealer(client, dealerName) {
  if (!dealerName || typeof dealerName !== 'string') {
    dealerName = 'Unknown Dealer';
  }
  dealerName = dealerName.trim();
  if (dealerName === '') {
      dealerName = 'Unknown Dealer';
  }
  
  // Try to find the user
  const res = await client.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1) AND role = $2', [dealerName, 'dealer']);
  if (res.rows.length > 0) {
    return res.rows[0].id;
  }
  
  // Not found, create
  console.log(`Creating new dealer: ${dealerName}`);
  const hashedPassword = await bcrypt.hash('dealer123', 10);
  
  // generate a unique email if possible, as it's UNIQUE NOT NULL
  let email = `${dealerName.toLowerCase().replace(/[^a-z0-9]/g, '')}@uhcrm.com`;
  if (!email || email === '@uhcrm.com') {
      email = `dealer_${Date.now()}@uhcrm.com`;
  }
  
  // ensure unique email
  const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingEmail.rows.length > 0) {
      email = `dealer_${Date.now()}_${Math.floor(Math.random()*1000)}@uhcrm.com`;
  }

  const insertRes = await client.query(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [dealerName, email, hashedPassword, 'dealer']
  );
  return insertRes.rows[0].id;
}

async function createTransaction(client, { date, description, type, refId, lines, instrument, instrument_number }) {
  const transRes = await client.query(
    'INSERT INTO transactions (transaction_date, description, reference_type, reference_id, instrument, instrument_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [date || new Date(), description, type, refId, instrument, instrument_number]
  );
  const transId = transRes.rows[0].id;

  for (let line of lines) {
    await client.query(
      'INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
      [transId, line.account_id, line.user_id || null, line.debit || 0, line.credit || 0]
    );
  }
  return transId;
}

async function getDealerIds(client, rawDealerString) {
  if (!rawDealerString) return [await getOrCreateDealer(client, 'Unknown Dealer')];
  
  // Split by '+' or '/'
  const names = rawDealerString.split(/[+/]/).map(n => n.trim()).filter(n => n.length > 0);
  if (names.length === 0) return [await getOrCreateDealer(client, 'Unknown Dealer')];

  const dealerIds = [];
  for (const name of names) {
    dealerIds.push(await getOrCreateDealer(client, name));
  }
  return dealerIds;
}

async function processAdvances(client) {
  console.log('\n--- Processing Advances for New deal ---');
  const filePath = path.join(__dirname, 'For Software (Advances for New deal).xlsx');
  const workbook = xlsx.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  let processedCount = 0;
  
  // Header is roughly row 4, data starts at row 5
  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const amount = parseFloat(row[4]);
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) continue;

    const dateSerial = row[0];
    const dealerNameRaw = cleanString(row[1]);
    const receipt = cleanString(row[2]);
    const mode = cleanString(row[3]);
    const desc = cleanString(row[6]) || `Advance deposit from ${dealerNameRaw || 'dealer'}`;
    
    const transDate = typeof dateSerial === 'number' ? excelDateToJSDate(dateSerial) : new Date();
    
    const dealerIds = await getDealerIds(client, dealerNameRaw);
    const splitAmount = amount / dealerIds.length;
    
    // Create lines for multiple dealers
    const depositLines = [ { account_id: ACCOUNTS.CASH_BANK, debit: amount } ];
    const transferLines = [ { account_id: ACCOUNTS.DEALER_ADVANCES, credit: amount } ];
    
    for (const dId of dealerIds) {
        depositLines.push({ account_id: ACCOUNTS.DEALER_FINANCE, user_id: dId, credit: splitAmount });
        transferLines.push({ account_id: ACCOUNTS.DEALER_FINANCE, user_id: dId, debit: splitAmount });
    }
    
    // Step 1: Cash/Bank -> Dealer Finance
    await createTransaction(client, {
      date: transDate,
      description: `[Advances] Fund receipt: ${desc}`,
      type: 'DEPOSIT',
      instrument: mode,
      instrument_number: receipt,
      lines: depositLines
    });
    
    // Step 2: Dealer Finance -> Dealer Advances
    await createTransaction(client, {
      date: transDate,
      description: `[Advances] Transfer to Advances: ${desc}`,
      type: 'TRANSFER',
      lines: transferLines
    });
    
    processedCount++;
  }
  console.log(`Processed ${processedCount} advance transactions.`);
}

async function processCertificates(client) {
  console.log('\n--- Processing Certificates ---');
  const filePath = path.join(__dirname, 'For Software (Certificates).xlsx');
  const workbook = xlsx.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  
  let processedCount = 0;
  
  // In Certificates, Header is actually row 17 (index 16), data starts row 18 (index 17)
  for (let i = 16; i < data.length; i++) {
    const row = data[i];
    const amount = parseFloat(row[8]); // Investment Value
    
    if (isNaN(amount) || amount <= 0) continue;
    
    const dateSerial = row[1];
    const qty = parseFloat(row[9]) || 0; // Form Qty
    const receipt = cleanString(row[5]);
    const dealerNameRaw = cleanString(row[10]); // Slip Own
    
    const transDate = typeof dateSerial === 'number' ? excelDateToJSDate(dateSerial) : new Date();
    
    const dealerIds = await getDealerIds(client, dealerNameRaw || 'Unknown Certificate Dealer');
    
    // Add Plot, Block, Size details into description
    const plotInfo = [cleanString(row[2]), cleanString(row[3]), cleanString(row[4])].filter(Boolean).join(' - ');
    const desc = `[Certificates] Qty: ${qty}. Plot: ${plotInfo}. Dealer: ${dealerNameRaw || ''}`;
    
    const splitAmount = amount / dealerIds.length;
    // Note: since our quantity is tracked at the transaction_line level, we don't have a quantity field in transaction_lines by default 
    // Wait, we added it via ALTER TABLE! But the insert schema in createTransaction doesn't use it!
    // We will just do a simple transaction split.
    
    const depositLines = [ { account_id: ACCOUNTS.CASH_BANK, debit: amount } ];
    const transferLines = [ { account_id: ACCOUNTS.ADVANCE_FOR_CERTIFICATE, credit: amount } ];
    
    for (const dId of dealerIds) {
        depositLines.push({ account_id: ACCOUNTS.DEALER_FINANCE, user_id: dId, credit: splitAmount });
        transferLines.push({ account_id: ACCOUNTS.DEALER_FINANCE, user_id: dId, debit: splitAmount });
    }
    
    // Step 1: Cash/Bank -> Dealer Finance
    await createTransaction(client, {
      date: transDate,
      description: `[Certificates] Fund receipt: ${desc}`,
      type: 'DEPOSIT',
      instrument_number: receipt,
      lines: depositLines
    });
    
    // Step 2: Dealer Finance -> Advance for Certificate
    const transId2 = await createTransaction(client, {
      date: transDate,
      description: `[Certificates] Allocate to certificates: ${desc}`,
      type: 'TRANSFER',
      lines: transferLines
    });
    
    // Inject quantity directly into the Advance for Certificate credit line
    await client.query(
        'UPDATE transaction_lines SET quantity = $1, plot_info = $2 WHERE transaction_id = $3 AND account_id = $4',
        [qty, plotInfo, transId2, ACCOUNTS.ADVANCE_FOR_CERTIFICATE]
    );
    
    processedCount++;
  }
  console.log(`Processed ${processedCount} certificate transactions.`);
}

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
    console.log('Connected to Database. Starting migration...');
    
    // Ensure accounting columns exist just in case they haven't been migrated locally
    try {
      await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voucher_no VARCHAR(100)`);
      await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS instrument VARCHAR(50)`);
      await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS instrument_number VARCHAR(100)`);
      await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS proof_file VARCHAR(500)`);
      
      // Ensure the chart of accounts is seeded
      await client.query(`
        INSERT INTO accounts (id, name, type)
        VALUES 
          (1, 'Cash / Bank', 'Asset'),
          (2, 'Accounts Receivable', 'Asset'),
          (3, 'Dealer Advances', 'Liability'),
          (4, 'Savings Deposits', 'Liability'),
          (5, 'Commission Payable', 'Liability'),
          (6, 'Corporate Revenue', 'Revenue'),
          (7, 'Dealer Commission Expense', 'Expense'),
          (8, 'Advance for Certificate', 'Liability'),
          (9, 'Dealer Finance', 'Liability')
        ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, name = EXCLUDED.name
      `);
    } catch(e) {
      console.log('Note: could not verify accounting columns or seed accounts:', e.message);
    }
    
    await client.query('BEGIN');
    
    await processAdvances(client);
    await processCertificates(client);
    
    await client.query('COMMIT');
    console.log('Migration committed successfully!');
  } catch (error) {
    console.error('Error during migration, rolling back.', error);
    try {
        await client.query('ROLLBACK');
    } catch(e) {}
  } finally {
    await client.end();
  }
}

run();
