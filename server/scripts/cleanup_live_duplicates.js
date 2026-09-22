// One-off cleanup: removes the leftover/duplicate records found on live after
// the Union Town re-import (see chat). Targets exact IDs only - never a blanket
// delete - so it can't accidentally touch anything else.
//
// Removes:
//   - deals 1, 2 ("abc" test deals, not part of the Union Town import) and
//     their inventory (1, 2)
//   - inventory 3 ("ESTEM PROPERTY", orphaned, no linked deal)
//   - deals 3, 4 and inventory 4, 5 (duplicate 444-E / 344-E from a partial
//     earlier run - the clean copies are deals 5/6, inventory 6/7)
//
// Run with: DATABASE_URL=<live db> node server/scripts/cleanup_live_duplicates.js

const pool = require('../config/database');

const DEAL_IDS_TO_REMOVE = [1, 2, 3, 4];
const INVENTORY_IDS_TO_REMOVE = [1, 2, 3, 4, 5];

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dealsBefore = await client.query('SELECT id, customer_id, dealer_id FROM deals WHERE id = ANY($1::int[])', [DEAL_IDS_TO_REMOVE]);
    const invBefore = await client.query('SELECT id, address, price FROM inventory WHERE id = ANY($1::int[])', [INVENTORY_IDS_TO_REMOVE]);
    console.log('Deals about to be removed:', JSON.stringify(dealsBefore.rows));
    console.log('Inventory about to be removed:', JSON.stringify(invBefore.rows));

    const delTx = await client.query(
      `DELETE FROM transactions WHERE reference_type IN ('DEAL','ADJUSTMENT','COMMISSION') AND reference_id = ANY($1::int[])`,
      [DEAL_IDS_TO_REMOVE]
    );
    const delTx2 = await client.query(
      `DELETE FROM transactions WHERE id IN (SELECT ledger_transaction_id FROM inventory_payments WHERE inventory_id = ANY($1::int[]) AND ledger_transaction_id IS NOT NULL)`,
      [INVENTORY_IDS_TO_REMOVE]
    );
    const delDeals = await client.query('DELETE FROM deals WHERE id = ANY($1::int[])', [DEAL_IDS_TO_REMOVE]);
    const delInventory = await client.query('DELETE FROM inventory WHERE id = ANY($1::int[])', [INVENTORY_IDS_TO_REMOVE]);

    await client.query('COMMIT');
    console.log(`Removed: ${delDeals.rowCount} deals, ${delInventory.rowCount} inventory, ${delTx.rowCount + delTx2.rowCount} ledger transactions.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
