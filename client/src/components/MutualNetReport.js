import React from 'react';
import './MutualNetReport.css';

/**
 * MutualNetReport - A reusable component to show net mutual balance summary and dealer breakdown.
 * @param {Array} balances - Array of peer balances (peer_id, peer_name, net_balance, etc.)
 * @param {Boolean} isAdmin - Whether the user is an admin
 * @param {Boolean} isAccountant - Whether the user is an accountant
 * @param {String} mode - 'card' for dashboard view, 'full' for page view
 */
const MutualNetReport = ({ balances = [], isAdmin, isAccountant, mode = 'card' }) => {
  const isManagement = isAdmin || isAccountant;

  // For management, "Owe" vs "Owed" is based on who represents the company (Admin/Accountant)
  // party1 is always the lower ID. If party1 is management and party2 is dealer:
  // net_balance > 0 means party1 sent more -> party2 (dealer) owes party1 (company) -> Owed to Me
  // net_balance < 0 means party2 sent more -> party1 (company) owes party2 (dealer) -> I Owe
  let owe = 0;
  let owed = 0;
  let card1Peers = [];
  let card2Peers = [];

  if (isManagement) {
    balances.forEach(b => {
      const p1Mgmt = b.party1_role === 'admin' || b.party1_role === 'accountant';
      const p2Mgmt = b.party2_role === 'admin' || b.party2_role === 'accountant';
      const net = parseFloat(b.net_balance);

      if (p1Mgmt && !p2Mgmt) {
        if (net > 0) { owed += net; card2Peers.push({ peer_name: b.party2_name, net_balance: net }); }
        else { owe += Math.abs(net); card1Peers.push({ peer_name: b.party2_name, net_balance: net }); }
      } else if (!p1Mgmt && p2Mgmt) {
        if (net > 0) { owe += net; card1Peers.push({ peer_name: b.party1_name, net_balance: net }); }
        else { owed += Math.abs(net); card2Peers.push({ peer_name: b.party1_name, net_balance: net }); }
      }
    });
  } else {
    // Original dealer-centric logic
    const totalPositive = balances.filter(b => parseFloat(b.net_balance) > 0)
      .reduce((sum, b) => sum + parseFloat(b.net_balance), 0);
    const totalNegative = balances.filter(b => parseFloat(b.net_balance) < 0)
      .reduce((sum, b) => sum + Math.abs(parseFloat(b.net_balance)), 0);
    
    owe = totalNegative;
    owed = totalPositive;
    card1Peers = balances.filter(b => parseFloat(b.net_balance) < 0);
    card2Peers = balances.filter(b => parseFloat(b.net_balance) > 0);
  }

  return (
    <div className={`mutual-net-report ${mode}`}>
      {!isAccountant && (
        <div className="mutual-summary-grid">
          <div className={`summary-card-v2 owe`}>
            <div className="card-header">
              <span className="dot"></span>
              <span className="label">
                Total I Owe
              </span>
            </div>
            <span className="value">${owe.toLocaleString()}</span>

            {card1Peers.length > 0 && (
              <div className="card-breakdown">
                {card1Peers.slice(0, 3).map((p, i) => (
                  <div key={i} className="breakdown-item">
                    <span className="peer-name">{p.peer_name}</span>
                    <span className="peer-amount">${Math.abs(parseFloat(p.net_balance)).toLocaleString()}</span>
                  </div>
                ))}
                {card1Peers.length > 3 && (
                  <div className="breakdown-more">+{card1Peers.length - 3} more</div>
                )}
              </div>
            )}
          </div>

          <div className={`summary-card-v2 owed`}>
            <div className="card-header">
              <span className="dot"></span>
              <span className="label">
                Total Owed to Me
              </span>
            </div>
            <span className="value">${owed.toLocaleString()}</span>

            {card2Peers.length > 0 && (
              <div className="card-breakdown">
                {card2Peers.slice(0, 3).map((p, i) => (
                  <div key={i} className="breakdown-item">
                    <span className="peer-name">{p.peer_name}</span>
                    <span className="peer-amount">${Math.abs(parseFloat(p.net_balance)).toLocaleString()}</span>
                  </div>
                ))}
                {card2Peers.length > 3 && (
                  <div className="breakdown-more">+{card2Peers.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isManagement && (
        <div className="dealer-breakdown-v2">
          <h3 className="breakdown-title">Dealer Mutual Summary</h3>
          <div className="dealer-table-container">
            <table className="dealer-net-table">
              <thead>
                <tr>
                  <th>{isManagement ? 'Party 1' : 'Dealer'}</th>
                  {isManagement && <th>Party 2</th>}
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                 {balances.length > 0 ? (
                  balances.map((db, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="dealer-cell">
                          <span className="name">{isManagement ? db.party1_name : db.peer_name}</span>
                          <span className="id">#{isManagement ? db.party1_id : db.peer_id} — {isManagement ? db.party1_role : db.peer_role}</span>
                        </div>
                      </td>
                      {isManagement && (
                        <td>
                          <div className="dealer-cell">
                            <span className="name">{db.party2_name}</span>
                            <span className="id">#{db.party2_id} — {db.party2_role}</span>
                          </div>
                        </td>
                      )}
                      <td>${parseFloat(db.sent_amount || 0).toLocaleString()}</td>
                      <td>${parseFloat(db.received_amount || 0).toLocaleString()}</td>
                      <td className={`net-cell ${parseFloat(db.net_balance) >= 0 ? 'good' : 'bad'}`}>
                        {parseFloat(db.net_balance) >= 0 ? '+' : '-'}${Math.abs(parseFloat(db.net_balance)).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isManagement ? "5" : "4"} className="no-data-v2">No active balances.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MutualNetReport;
