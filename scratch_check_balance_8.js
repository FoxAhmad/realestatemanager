const db = require('./server/config/database');

async function test() {
  try {
    const res = await db.query(`
      SELECT t.id, t.description, tl.debit, tl.credit, t.transaction_date
      FROM transactions t
      JOIN transaction_lines tl ON t.id = tl.transaction_id
      WHERE tl.account_id = 8
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT 10
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

test();
