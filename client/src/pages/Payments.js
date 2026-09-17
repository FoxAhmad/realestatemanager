import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './Payments.css';

const PAYMENT_TYPE_LABELS = {
  booking: 'Booking / Down Payment',
  down_payment: 'Booking / Down Payment',
  installment: 'Instalment Plans',
  excess_area: 'Excess Area',
  possession_fee: 'Possession Fee',
  form_fee: 'Form Fee',
  other: 'General / Others',
};

const PAYMENT_COLUMNS = [
  { key: 'payment_date', label: 'Date', type: 'date' },
  { key: 'payment_type', label: 'Classification', type: 'enum', formatOption: (v) => PAYMENT_TYPE_LABELS[v] || v },
  { key: 'deal_id', label: 'Asset / Deal', type: 'text' },
  { key: 'customer_name', label: 'Associate', type: 'text' },
  { key: 'amount', label: 'Voucher Amount', type: 'currency' },
  { key: 'instrument', label: 'Instrument', type: 'text' },
  { key: 'lps_amount', label: 'LPS', type: 'currency' },
];

const Payments = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments');
      setPayments(response.data);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this payment record permanently?')) {
      try {
        await api.delete(`/payments/${id}`);
        fetchPayments();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment record');
      }
    }
  };

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredPayments,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(payments, PAYMENT_COLUMNS);

  const totalAmount = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  if (loading) return <div className="payments-loading">Processing Sovereign Ledger...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Transaction History</h1>
          <p>Global audit trail for all property-related financial inbound transactions.</p>
        </div>
      </div>

      <div className="payments-summary-container">
        <div className="summary-card glass-card">
          <span className="summary-label">Aggregate Inflow</span>
          <span className="summary-value amount">
            Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="summary-card glass-card">
          <span className="summary-label">Record Count</span>
          <span className="summary-value">{filteredPayments.length} Entries</span>
        </div>
      </div>

      <div className="glass-card">
        <TableToolbar
          columns={PAYMENT_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search payments by deal, associate..."
          resultCount={filteredPayments.length}
        />
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Classification</th>
                <th>Asset / Deal</th>
                <th>Associate</th>
                <th style={{ textAlign: 'right' }}>Voucher Amount</th>
                <th>Instrument / Receipt</th>
                <th style={{ textAlign: 'right' }}>LPS</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">
                    No financial records match the current criteria
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Date" style={{ fontWeight: 600 }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td data-label="Classification">
                      <span className={`premium-badge ${
                        (p.payment_type === 'booking' || p.payment_type === 'down_payment') ? 'premium-badge-primary' :
                        p.payment_type === 'installment' ? 'premium-badge-info' :
                        'premium-badge-neutral'
                      }`}>
                        {(PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type || 'other').toUpperCase()}
                      </span>
                    </td>
                    <td data-label="Asset / Deal">
                      <button className="link-button" onClick={() => navigate(`/deals/${p.deal_id}`)}>
                        Deal Archive #{p.deal_id}
                      </button>
                    </td>
                    <td data-label="Associate" style={{ fontWeight: 600 }}>{p.customer_name}</td>
                    <td data-label="Voucher Amount" className="amount-cell" style={{ textAlign: 'right' }}>
                      Rs. {parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td data-label="Instrument / Receipt" style={{ fontSize: '0.8rem' }}>
                      {p.instrument ? p.instrument.replace('_', ' ').toUpperCase() : '-'}
                      {p.instrument_number ? ` # ${p.instrument_number}` : ''}
                      {p.voucher_no ? ` · ${p.voucher_no}` : ''}
                    </td>
                    <td data-label="LPS" className="amount-cell" style={{ textAlign: 'right' }}>
                      {parseFloat(p.lps_amount || 0) > 0 ? `Rs. ${parseFloat(p.lps_amount).toLocaleString()}` : '-'}
                    </td>
                    <td data-label="Actions">
                      <button
                        className="premium-btn premium-btn-danger"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Payments;
