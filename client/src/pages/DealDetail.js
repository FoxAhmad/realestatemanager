import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './DealDetail.css';

const DealDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [deal, setDeal] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'down_payment',
    amount: '',
    payment_date: '',
    notes: '',
  });
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchDeal();
  }, [id]);

  const fetchDeal = async () => {
    try {
      const response = await api.get(`/deals/${id}`);
      setDeal(response.data);
      setPayments(response.data.payments || []);
      setEditForm({
        status: response.data.status,
        original_price: response.data.original_price || '',
        sale_price: response.data.sale_price || '',
        demand_price: response.data.demand_price || '',
        difference_amount: response.data.difference_amount || '',
        remaining_price: response.data.remaining_price || '',
        remaining_price_time: response.data.remaining_price_time || '',
        is_build: response.data.is_build || false,
        admin_cash: response.data.admin_cash || false,
        plot_info: response.data.plot_info || '',
        house_address: response.data.house_address || '',
        house_info: response.data.house_info || '',
        sale_price_location: response.data.sale_price_location || '',
      });
    } catch (error) {
      console.error('Error fetching deal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/payments', {
        ...paymentForm,
        deal_id: id,
      });
      fetchDeal();
      setShowPaymentModal(false);
      setPaymentForm({
        payment_type: 'down_payment',
        amount: '',
        payment_date: '',
        notes: '',
      });
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Error creating payment');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      await api.put(`/deals/${id}`, editForm);
      fetchDeal();
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating deal:', error);
      alert('Error updating deal');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment?')) {
      try {
        await api.delete(`/payments/${paymentId}`);
        fetchDeal();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
      }
    }
  };

  if (loading) {
    return <div className="deal-detail-loading">Loading deal details...</div>;
  }

  if (!deal) {
    return <div className="deal-detail-error">Deal not found</div>;
  }

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const remaining = deal.sale_price ? parseFloat(deal.sale_price) - totalPaid : 0;

  return (
    <div className="deal-detail">
      <div className="deal-detail-header">
        <button className="btn-back" onClick={() => navigate('/deals')}>
          ← Back to Deals
        </button>
        {isAdmin && (
          <button
            className="btn-primary"
            onClick={() => setShowEditModal(true)}
          >
            Edit Deal
          </button>
        )}
      </div>

      <div className="deal-detail-content">
        <div className="deal-info-card">
          <h2>Deal Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Deal ID</label>
              <span>{deal.id}</span>
            </div>
            <div className="info-item">
              <label>Status</label>
              <span className={`status-badge status-${deal.status}`}>
                {deal.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="info-item">
              <label>Customer</label>
              <span>{deal.customer_name || '-'}</span>
            </div>
            <div className="info-item">
              <label>Salesperson</label>
              <span>{deal.dealer_name}</span>
            </div>
            {deal.inventory_address && (
              <div className="info-item">
                <label>Inventory</label>
                <span>{deal.inventory_category} - {deal.inventory_address}</span>
              </div>
            )}
            <div className="info-item">
              <label>Property Type</label>
              <span>{deal.property_type.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div className="info-item">
              <label>Original Price</label>
              <span>
                {deal.original_price
                  ? `$${parseFloat(deal.original_price).toLocaleString()}`
                  : '-'}
              </span>
            </div>
            <div className="info-item">
              <label>Sale Price</label>
              <span>
                {deal.sale_price
                  ? `$${parseFloat(deal.sale_price).toLocaleString()}`
                  : '-'}
              </span>
            </div>
            <div className="info-item">
              <label>Profit</label>
              <span>
                {deal.profit
                  ? `$${parseFloat(deal.profit).toLocaleString()} (${deal.profit_percentage}%)`
                  : '-'}
              </span>
            </div>
            {deal.plot_info && (
              <div className="info-item full-width">
                <label>Plot Info</label>
                <span>{deal.plot_info}</span>
              </div>
            )}
            {deal.house_address && (
              <div className="info-item full-width">
                <label>House Address</label>
                <span>{deal.house_address}</span>
              </div>
            )}
            {deal.house_info && (
              <div className="info-item full-width">
                <label>House Info</label>
                <span>{deal.house_info}</span>
              </div>
            )}
            {deal.plots && deal.plots.length > 0 && (
              <div className="info-item full-width">
                <label>Plots Used in Deal</label>
                <div style={{ marginTop: '0.5rem' }}>
                  {deal.plots.map((plot, index) => (
                    <span
                      key={plot.id}
                      style={{
                        display: 'inline-block',
                        background: '#f8f9fa',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        marginRight: '0.5rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.875rem',
                      }}
                    >
                      {plot.plot_number} ({plot.status})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="payments-section">
          <div className="payments-header">
            <h2>Payments</h2>
            <button
              className="btn-primary"
              onClick={() => setShowPaymentModal(true)}
            >
              + Add Payment
            </button>
          </div>

          <div className="payment-summary">
            <div className="summary-item">
              <label>Total Paid</label>
              <span className="amount">${totalPaid.toLocaleString()}</span>
            </div>
            <div className="summary-item">
              <label>Remaining</label>
              <span className="amount remaining">
                ${remaining.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="payments-list">
            {payments.length === 0 ? (
              <div className="empty-state">No payments recorded</div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="payment-item">
                  <div className="payment-info">
                    <div className="payment-type">
                      {payment.payment_type.replace('_', ' ').toUpperCase()}
                    </div>
                    <div className="payment-amount">
                      ${parseFloat(payment.amount).toLocaleString()}
                    </div>
                    <div className="payment-date">
                      {new Date(payment.payment_date).toLocaleDateString()}
                    </div>
                    {payment.notes && (
                      <div className="payment-notes">{payment.notes}</div>
                    )}
                  </div>
                  <button
                    className="btn-delete-small"
                    onClick={() => handleDeletePayment(payment.id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPaymentModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Payment</h2>
            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label>Payment Type *</label>
                <select
                  value={paymentForm.payment_type}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_type: e.target.value,
                    })
                  }
                  required
                >
                  <option value="down_payment">Down Payment</option>
                  <option value="installment">Installment</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      payment_date: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Deal</h2>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Status *</label>
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value })
                  }
                  required
                >
                  <option value="in_progress">In Progress</option>
                  <option value="deal_done">Deal Done</option>
                  <option value="deal_not_done">Deal Not Done</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Original Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.original_price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, original_price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Sale Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.sale_price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, sale_price: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Demand Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.demand_price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, demand_price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Difference Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.difference_amount}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        difference_amount: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Remaining Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.remaining_price}
                    onChange={(e) =>
                      setEditForm({ ...editForm, remaining_price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Remaining Price Time</label>
                  <input
                    type="date"
                    value={editForm.remaining_price_time}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        remaining_price_time: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.is_build}
                      onChange={(e) =>
                        setEditForm({ ...editForm, is_build: e.target.checked })
                      }
                    />
                    Is Build
                  </label>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.admin_cash}
                      onChange={(e) =>
                        setEditForm({ ...editForm, admin_cash: e.target.checked })
                      }
                    />
                    Admin Cash
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealDetail;

