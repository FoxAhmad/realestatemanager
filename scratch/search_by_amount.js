const pool = require('../server/config/database');

async function check() {
    const client = await pool.connect();
    try {
        console.log("Searching for entries with credit 1,000,000 or 120,000...");
        const entriesRes = await client.query(`
            SELECT tl.id, tl.transaction_id, tl.user_id, tl.debit, tl.credit, t.description, u.name as user_name
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            LEFT JOIN users u ON tl.user_id = u.id
            WHERE tl.credit IN (1000000, 120000)
            ORDER BY t.transaction_date DESC
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
