import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Payments.css';

const Payments = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

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

  const handleDelete = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment?')) {
      try {
        await api.delete(`/payments/${paymentId}`);
        fetchPayments();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
      }
    }
  };

  const getPaymentTypeLabel = (type) => {
    const labels = {
      down_payment: 'Down Payment',
      installment: 'Installment',
    };
    return labels[type] || type;
  };

  const filteredPayments = payments.filter((payment) => {
    if (filterType !== 'all' && payment.payment_type !== filterType) {
      return false;
    }
    return true;
  });

  const totalReceived = filteredPayments.reduce(
    (sum, p) => sum + parseFloat(p.amount || 0),
    0
  );

  if (loading) {
    return <div className="payments-loading">Loading payments...</div>;
  }

  return (
    <div className="payments">
      <div className="payments-header">
        <h1 className="payments-title">Payments</h1>
        <div className="payments-summary">
          <div className="summary-card">
            <span className="summary-label">Total Payments</span>
            <span className="summary-value">{filteredPayments.length}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Total Amount</span>
            <span className="summary-value amount">
              ${totalReceived.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="payments-filters">
        <div className="filter-group">
          <label>Payment Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="down_payment">Down Payment</option>
            <option value="installment">Installment</option>
          </select>
        </div>
      </div>

      <div className="payments-table-container">
        <table className="payments-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Deal ID</th>
              <th>Payment Type</th>
              <th>Amount</th>
              <th>Payment Date</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  No payments found
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.id}</td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => navigate(`/deals/${payment.deal_id}`)}
                    >
                      Deal #{payment.deal_id}
                    </button>
                  </td>
                  <td>
                    <span className={`payment-type-badge payment-type-${payment.payment_type}`}>
                      {getPaymentTypeLabel(payment.payment_type)}
                    </span>
                  </td>
                  <td className="amount-cell">
                    ${parseFloat(payment.amount || 0).toLocaleString()}
                  </td>
                  <td>
                    {new Date(payment.payment_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td>
                    {payment.notes ? (
                      <span className="notes-text" title={payment.notes}>
                        {payment.notes.length > 50
                          ? `${payment.notes.substring(0, 50)}...`
                          : payment.notes}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(payment.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Payments;

