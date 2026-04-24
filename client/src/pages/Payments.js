import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Payments.css';

const Payments = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await api.get('/deals/payments/all');
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
        await api.delete(`/deals/payments/${id}`);
        fetchPayments();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment record');
      }
    }
  };

  const filteredPayments = filterType === 'all' 
    ? payments 
    : payments.filter(p => p.payment_type === filterType);

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
            ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="summary-card glass-card">
          <span className="summary-label">Record Count</span>
          <span className="summary-value">{filteredPayments.length} Entries</span>
        </div>
      </div>

      <div className="glass-card payments-filters">
        <div className="filter-group">
          <label>Filter by Classification</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Transactions</option>
            <option value="down_payment">Booking / Down Payment</option>
            <option value="installment">Instalment Plans</option>
            <option value="other">General / Others</option>
          </select>
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Classification</th>
                <th>Asset / Deal</th>
                <th>Associate</th>
                <th style={{ textAlign: 'right' }}>Voucher Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">
                    No financial records match the current criteria
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td>
                      <span className={`premium-badge ${
                        (p.payment_type === 'booking' || p.payment_type === 'down_payment') ? 'premium-badge-primary' : 
                        p.payment_type === 'installment' ? 'premium-badge-info' : 
                        'premium-badge-neutral'
                      }`}>
                        {(p.payment_type || 'other').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button className="link-button" onClick={() => navigate(`/deals/${p.deal_id}`)}>
                        Deal Archive #{p.deal_id}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.customer_name}</td>
                    <td className="amount-cell" style={{ textAlign: 'right' }}>
                      ${parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>
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
