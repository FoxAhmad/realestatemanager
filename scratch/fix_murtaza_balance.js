const pool = require('../server/config/database');

async function fix() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Get Transaction ID
        const txRes = await client.query("SELECT id FROM transactions WHERE voucher_no = '1234234'");
        if (txRes.rows.length === 0) {
            console.log("Transaction not found");
            return;
        }
        const txId = txRes.rows[0].id;
        console.log(`Found transaction ID: ${txId}`);

        // 2. Get Users
        const murtazaRes = await client.query("SELECT id FROM users WHERE name = 'murtaza'");
        const azamRes = await client.query("SELECT id FROM users WHERE name = 'Azam'");
        
        if (murtazaRes.rows.length === 0 || azamRes.rows.length === 0) {
            console.log("Users not found");
            return;
        }
        const murtazaId = murtazaRes.rows[0].id;
        const azamId = azamRes.rows[0].id;
        console.log(`Murtaza ID: ${murtazaId}, Azam ID: ${azamId}`);

        // 3. Delete existing Debit lines for this transaction in Dealer Finance
        // We want to replace them with the correct split
        const dealerFinanceId = 9; // Based on ledgerService.js
        
        await client.query(
            "DELETE FROM transaction_lines WHERE transaction_id = $1 AND account_id = $2 AND debit > 0",
            [txId, dealerFinanceId]
        );
        console.log("Deleted old debit lines");

        // 4. Insert correct Debit lines
        await client.query(
            "INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)",
            [txId, dealerFinanceId, murtazaId, 9999, 0]
        );
        await client.query(
            "INSERT INTO transaction_lines (transaction_id, account_id, user_id, debit, credit) VALUES ($1, $2, $3, $4, $5)",
            [txId, dealerFinanceId, azamId, 1000000, 0]
        );
        console.log("Inserted correct split debit lines");

        await client.query('COMMIT');
        console.log("Successfully fixed the balance!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
    } finally {
        client.release();
        process.exit();
    }
}

fix();
