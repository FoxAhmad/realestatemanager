const pool = require('../server/config/database');

async function check() {
    const client = await pool.connect();
    try {
        console.log("Checking transaction_lines schema...");
        const columnsRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'transaction_lines'
        `);
        console.table(columnsRes.rows);

        console.log("\nChecking recent entries in transaction_lines for DEALER_FINANCE (Account 9)...");
        const entriesRes = await client.query(`
            SELECT tl.id, tl.transaction_id, tl.user_id, tl.debit, tl.credit, t.description, u.name as user_name
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            LEFT JOIN users u ON tl.user_id = u.id
            WHERE tl.account_id = 9
            ORDER BY t.transaction_date DESC
            LIMIT 10
        `);
        console.table(entriesRes.rows);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        process.exit();
    }
}

check();
