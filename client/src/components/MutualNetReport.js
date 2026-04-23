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

  // Aggregate summary: Management sees only dealer balances; Dealers see everything (including Admin)
  const summaryBalances = isManagement
    ? balances.filter(b => b.peer_role !== 'admin')
    : balances;

  // Positive balance means I sent more than I received (Asset)
  // Negative balance means I received more than I sent (Liability)
  const totalPositive = summaryBalances.filter(b => parseFloat(b.net_balance) > 0)
    .reduce((sum, b) => sum + parseFloat(b.net_balance), 0);

  const totalNegative = summaryBalances.filter(b => parseFloat(b.net_balance) < 0)
    .reduce((sum, b) => sum + Math.abs(parseFloat(b.net_balance)), 0);

  // Peers contributing to each category
  const card1Peers = isManagement
    ? summaryBalances.filter(b => parseFloat(b.net_balance) > 0)
    : summaryBalances.filter(b => parseFloat(b.net_balance) < 0);

  const card2Peers = isManagement
    ? summaryBalances.filter(b => parseFloat(b.net_balance) < 0)
    : summaryBalances.filter(b => parseFloat(b.net_balance) > 0);

  // Card 1 (Left): Admin Asset OR Dealer Liability
  const owe = isManagement ? totalPositive : totalNegative;

  // Card 2 (Right): Admin Liability OR Dealer Asset
  const owed = isManagement ? totalNegative : totalPositive;

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
                {card1Peers.slice(0, 3).map(p => (
                  <div key={p.peer_id} className="breakdown-item">
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
                {card2Peers.slice(0, 3).map(p => (
                  <div key={p.peer_id} className="breakdown-item">
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
                  <th>Dealer</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {balances.length > 0 ? (
                  balances.map(db => (
                    <tr key={db.peer_id}>
                      <td className="dealer-cell">
                        <span className="name">{db.peer_name}</span>
                        <span className="id">#{db.peer_id}</span>
                      </td>
                      <td>${parseFloat(db.sent_amount || 0).toLocaleString()}</td>
                      <td>${parseFloat(db.received_amount || 0).toLocaleString()}</td>
                      <td className={`net-cell ${parseFloat(db.net_balance) >= 0 ? 'good' : 'bad'}`}>
                        {parseFloat(db.net_balance) >= 0 ? '+' : '-'}${Math.abs(parseFloat(db.net_balance)).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="no-data-v2">No active balances.</td>
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
