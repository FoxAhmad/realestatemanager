const db = require('./server/config/database');
const q = `
  SELECT u.id as peer_id, u.name as peer_name,
    (
      COALESCE((SELECT SUM(amount) FROM dealer_exchanges WHERE receiver_id = u.id), 0) -
      COALESCE((SELECT SUM(amount) FROM dealer_exchanges WHERE sender_id = u.id), 0)
    ) as net_balance
  FROM users u
  WHERE u.role = 'dealer'
  ORDER BY u.name
`;
db.query(q).then(r => {
  console.log('PEER BALANCES:', r.rows);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
