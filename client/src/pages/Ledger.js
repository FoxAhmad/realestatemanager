import React, { useState, useEffect } from 'react';
import api from '../services/api';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './Ledger.css';

const LEDGER_COLUMNS = [
  { key: 'transaction_date', label: 'Date', type: 'date' },
  { key: 'voucher_no', label: 'Voucher #', type: 'text' },
  {
    key: 'account_description',
    label: 'Account & Description',
    type: 'text',
    accessor: (row) => `${row.account_name || ''} ${row.description || ''}`.trim(),
  },
  { key: 'debit', label: 'Debit', type: 'currency' },
  { key: 'credit', label: 'Credit', type: 'currency' },
];

const Ledger = () => {
  const [ledgerLines, setLedgerLines] = useState([]);
  const [loading, setLoading] = useState(true);

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredLedgerLines,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(ledgerLines, LEDGER_COLUMNS);

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
        <TableToolbar
          columns={LEDGER_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search ledger by voucher, account, description..."
          resultCount={filteredLedgerLines.length}
        />
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
              {filteredLedgerLines.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No ledger entries recorded in this period
                  </td>
                </tr>
              ) : (
                filteredLedgerLines.map((line, index) => {
                  const isCredit = parseFloat(line.credit || 0) > 0;
                  // Grouping logic: if next line is same transaction, style accordingly
                  // For now simple list
                  return (
                    <tr key={line.id} className={isCredit ? 'tx-line-credit' : 'tx-line-debit'}>
                      <td data-label="Date">{new Date(line.transaction_date).toLocaleDateString()}</td>
                      <td data-label="Voucher #">
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
                      <td data-label="Account & Description" className={isCredit ? 'credit-account' : ''}>
                        <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{line.account_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{line.description}</div>
                      </td>
                      <td data-label="Debit" className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                        {!isCredit ? parseFloat(line.debit).toLocaleString() : '-'}
                      </td>
                      <td data-label="Credit" className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
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
