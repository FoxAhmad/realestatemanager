const db = require('./server/config/database');

async function test() {
  try {
    const user = { id: 7, role: 'accountant' }; // Simulation of muzammil
    
    let peerBalancesResult;
    peerBalancesResult = await db.query(`
         SELECT 
           u1.id as party1_id, u1.name as party1_name, u1.role as party1_role,
           u2.id as party2_id, u2.name as party2_name, u2.role as party2_role,
           SUM(CASE WHEN de.sender_id = u1.id THEN de.amount ELSE 0 END) as sent_amount,
           SUM(CASE WHEN de.receiver_id = u1.id THEN de.amount ELSE 0 END) as received_amount,
           (
             SUM(CASE WHEN de.sender_id = u1.id THEN de.amount ELSE 0 END) -
             SUM(CASE WHEN de.receiver_id = u1.id THEN de.amount ELSE 0 END)
           ) as net_balance
         FROM dealer_exchanges de
         JOIN users u1 ON LEAST(de.sender_id, de.receiver_id) = u1.id
         JOIN users u2 ON GREATEST(de.sender_id, de.receiver_id) = u2.id
         GROUP BY party1_id, party1_name, party1_role, party2_id, party2_name, party2_role
         ORDER BY u1.name, u2.name
    `);
    
    console.log('--- Relationship Balances for Management ---');
    console.log(JSON.stringify(peerBalancesResult.rows, null, 2));
    
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

test();
