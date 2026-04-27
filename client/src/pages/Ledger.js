import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Ledger.css';

const Ledger = () => {
  const [ledgerLines, setLedgerLines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedger();
  }, []);

  const fetchLedger = async () => {
    try {
      const response = await api.get('/finance/ledger');
      setLedgerLines(response.data);
    } catch (error) {
      console.error('Error fetching ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Group ledger lines by transaction_id for visual grouping if needed,
   * though the request is a simple flat list with some styling.
   */

  if (loading) return <div className="ledger-loading">Reconciling Financial Logs...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>General Ledger</h1>
          <p>Transaction-level visibility into all accounting event logs.</p>
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher #</th>
                <th>Account & Description</th>
                <th className="amount-col">Debit</th>
                <th className="amount-col">Credit</th>
              </tr>
            </thead>
            <tbody>
              {ledgerLines.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No ledger entries recorded in this period
                  </td>
                </tr>
              ) : (
                ledgerLines.map((line, index) => {
                  const isCredit = parseFloat(line.credit || 0) > 0;
                  // Grouping logic: if next line is same transaction, style accordingly
                  // For now simple list
                  return (
                    <tr key={line.id} className={isCredit ? 'tx-line-credit' : 'tx-line-debit'}>
                      <td>{new Date(line.transaction_date).toLocaleDateString()}</td>
                      <td>
                        {line.voucher_no && <div className="voucher-badge">{line.voucher_no}</div>}
                        <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.7rem' }}>
                          TX-{line.transaction_id.toString().padStart(5, '0')}
                        </div>
                        {line.instrument && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {line.instrument} {line.instrument_number}
                          </div>
                        )}
                      </td>
                      <td className={isCredit ? 'credit-account' : ''}>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{line.account_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{line.description}</div>
                      </td>
                      <td className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                        {!isCredit ? parseFloat(line.debit).toLocaleString() : '-'}
                      </td>
                      <td className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                        {isCredit ? parseFloat(line.credit).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Ledger;
