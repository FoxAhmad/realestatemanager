require('dotenv').config();
const db = require('../server/config/database');
async function migrate() {
    try {
        await db.query('ALTER TABLE transaction_lines ADD COLUMN IF NOT EXISTS linked_line_id INTEGER REFERENCES transaction_lines(id) ON DELETE SET NULL;');
        console.log('Success');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
migrate();
