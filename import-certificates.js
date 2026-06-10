require('dotenv').config();
const { Client } = require('pg');
const xlsx = require('xlsx');
const path = require('path');

const staffList = ['Azam', 'Umar Khan', 'Murtaza', 'Hafiz Shah', 'Adil Siraj', 'Zain'];

async function importData() {
    console.log('Connecting to database...');
    const dbName = process.env.DB_NAME || 'uh_crm';
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: dbName,
        port: process.env.DB_PORT || 5432,
    });
    await client.connect();

    try {
        console.log('Reading Excel file...');
        const wb = xlsx.readFile(path.join(__dirname, 'For Software (Certificates).xlsx'));
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

        let headerRowIdx = -1;
        for (let i = 0; i < data.length; i++) {
            if (data[i] && data[i].includes('Estate/Office')) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx === -1) {
            throw new Error('Header row not found');
        }

        const headers = data[headerRowIdx];
        const nameIdx = headers.indexOf('Estate/Office');
        const qtyIdx = headers.indexOf('Form Qty');
        const amountIdx = headers.indexOf('Investment Value');

        console.log('Fetching accounts...');
        const accRes = await client.query("SELECT id, name FROM accounts WHERE id IN (1, 8)");
        const CASH_BANK = 1;
        const ADVANCE_FOR_CERTIFICATE = 8;
        
        let importedCount = 0;
        let skippedStaff = 0;
        let totalAmount = 0;

        await client.query('BEGIN');

        // We use user ID 1 (Admin) as the creator for these entries
        const adminId = 1;

        for (let i = headerRowIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[nameIdx]) continue;
            
            const name = row[nameIdx].trim();
            const qty = row[qtyIdx];
            const amount = parseFloat(row[amountIdx]);

            if (!amount || isNaN(amount)) continue;

            if (staffList.includes(name)) {
                skippedStaff++;
                continue;
            }

            // Find or create customer
            let custRes = await client.query('SELECT id FROM customers WHERE name = $1 LIMIT 1', [name]);
            let customerId;
            
            if (custRes.rows.length > 0) {
                customerId = custRes.rows[0].id;
            } else {
                custRes = await client.query(
                    "INSERT INTO customers (name, status, created_by) VALUES ($1, 'successful', $2) RETURNING id",
                    [name, adminId]
                );
                customerId = custRes.rows[0].id;
            }

            // Create Transaction
            const transRes = await client.query(
                `INSERT INTO transactions 
                    (transaction_date, description, reference_type) 
                VALUES ($1, $2, 'DEPOSIT') RETURNING id`,
                [new Date(), `Imported Certificate Advance for ${qty} forms`]
            );
            const transId = transRes.rows[0].id;

            // Insert Lines (Debit Cash, Credit Liability)
            await client.query(
                'INSERT INTO transaction_lines (transaction_id, account_id, customer_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
                [transId, ADVANCE_FOR_CERTIFICATE, customerId, amount]
            );
            await client.query(
                'INSERT INTO transaction_lines (transaction_id, account_id, debit, credit) VALUES ($1, $2, $3, 0)',
                [transId, CASH_BANK, amount]
            );

            importedCount++;
            totalAmount += amount;
        }

        await client.query('COMMIT');
        console.log('--- IMPORT SUCCESSFUL ---');
        console.log(`Imported ${importedCount} entries to customers.`);
        console.log(`Skipped ${skippedStaff} staff entries.`);
        console.log(`Total amount imported: Rs. ${totalAmount.toLocaleString()}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during import:', err);
    } finally {
        await client.end();
    }
}

importData().catch(console.error);
