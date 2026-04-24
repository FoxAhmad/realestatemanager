import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaArrowLeft, FaPlus, FaTrash, FaFileInvoiceDollar, FaUser, FaMapMarkerAlt } from 'react-icons/fa';
import './DealDetail.css';

const DealDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAccountant } = useAuth();
  const [deal, setDeal] = useState(null);
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [defaultCost, setDefaultCost] = useState(20000);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'installment',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [adjustmentForm, setAdjustmentForm] = useState({
    customer_price: '',
    cost_price: 20000,
    adjustment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const fetchDealDetails = useCallback(async () => {
    try {
      const dealRes = await api.get(`/deals/${id}`);
      setDeal(dealRes.data);
      const paymentsRes = await api.get(`/deals/${id}/payments`);
      setPayments(paymentsRes.data);
      
      // Fetch adjustments
      const adjRes = await api.get(`/balance-transactions/8?deal_id=${id}`);
      // Filtering for this deal if not already filtered by backend
      setAdjustments(adjRes.data.filter(a => a.reference_id === parseInt(id)));

      // Fetch default cost
      const settingsRes = await api.get('/settings');
      const costSetting = settingsRes.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_DEFAULT_COST');
      if (costSetting) {
        setDefaultCost(costSetting.setting_value);
        setAdjustmentForm(prev => ({ ...prev, cost_price: costSetting.setting_value }));
      }
    } catch (error) {
      console.error('Error fetching deal details:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDealDetails();
  }, [fetchDealDetails]);

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/deals/${id}/payments`, paymentForm);
      fetchDealDetails();
      setShowPaymentModal(false);
      setPaymentForm({
        amount: '',
        payment_type: 'installment',
        payment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (error) {
      console.error('Error recording payment:', error);
      alert(error.response?.data?.message || 'Error recording payment');
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/balance-transactions/adjust-deal', {
        ...adjustmentForm,
        deal_id: id
      });
      fetchDealDetails();
      setShowAdjustmentModal(false);
      setAdjustmentForm({
        customer_price: '',
        cost_price: defaultCost,
        adjustment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (error) {
      alert(error.response?.data?.message || 'Error recording adjustment');
    }
  };

  const handlePaymentDelete = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      try {
        await api.delete(`/deals/payments/${paymentId}`);
        fetchDealDetails();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
      }
    }
  };

  if (loading) return <div className="deal-detail-loading">Loading Transaction Profile...</div>;
  if (!deal) return <div className="deal-detail-error">Deal not found.</div>;

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const totalAdjusted = adjustments.reduce((sum, a) => sum + parseFloat(a.customer_price || 0), 0);
  const remainingBalance = parseFloat(deal.sale_price || 0) - totalPaid - totalAdjusted;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="premium-btn premium-btn-secondary" onClick={() => navigate('/deals')}>
            <FaArrowLeft /> Back
          </button>
          <div>
            <h1>Deal Profile #{deal.id}</h1>
            <p>Comprehensive overview of property assignment and payment status.</p>
          </div>
        </div>
        <div>
          <span className={`premium-badge ${deal.status === 'done' ? 'premium-badge-success' : 'premium-badge-warning'}`}>
            {(deal?.status || 'Active').replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="deal-detail-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Customer & Asset Info */}
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <FaUser style={{ color: 'var(--primary)' }} />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Associate Information</h2>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <label>Customer</label>
                <span>{deal.customer_name}</span>
              </div>
              <div className="info-item">
                <label>CNIC</label>
                <span>{deal.customer_cnic}</span>
              </div>
              <div className="info-item">
                <label>Salesperson</label>
                <span>{deal.dealer_name}</span>
              </div>
            </div>
            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #f1f5f9' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <FaMapMarkerAlt style={{ color: 'var(--primary)' }} />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Asset Details</h2>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <label>Address</label>
                <span>{deal.inventory_address}</span>
              </div>
              <div className="info-item">
                <label>Plot Number</label>
                <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{deal.plot_number || 'N/A'}</span>
              </div>
              <div className="info-item">
                <label>Category</label>
                <span>{deal.inventory_category}</span>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <FaFileInvoiceDollar style={{ color: 'var(--primary)' }} />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Financial Status</h2>
            </div>
            <div className="payment-summary">
              <div className="summary-item">
                <label>Sale Price</label>
                <span className="amount">${parseFloat(deal.sale_price || 0).toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Paid Amount</label>
                <span className="amount" style={{ color: 'var(--success)' }}>${totalPaid.toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Cert. Adjustments</label>
                <span className="amount" style={{ color: '#ffc107' }}>${totalAdjusted.toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Remaining</label>
                <span className="amount remaining">${remainingBalance.toLocaleString()}</span>
              </div>
            </div>
            {deal.notes && (
              <div className="info-item" style={{ marginTop: '1.5rem' }}>
                <label>Special Notes</label>
                <p style={{ margin: 0, fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>{deal.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Payments Table Area */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Ledger Entries / Payments</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {(isAdmin || isAccountant) && (
                <>
                  <button className="premium-btn premium-btn-secondary" onClick={() => setShowAdjustmentModal(true)}>
                    <FaPlus /> Add Adjustment
                  </button>
                  <button className="premium-btn premium-btn-primary" onClick={() => setShowPaymentModal(true)}>
                    <FaPlus /> Post Payment
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="payments-list">
            {payments.length === 0 && adjustments.length === 0 ? (
              <div className="empty-state">No financial records found for this deal.</div>
            ) : (
              <>
                {adjustments.map((a) => (
                  <div key={`adj-${a.id}`} className="payment-item" style={{ borderLeft: '4px solid #ffc107' }}>
                    <div className="payment-main">
                      <div className="payment-type" style={{ background: '#ffc107', color: '#000' }}>ADJUSTMENT</div>
                      <div className="payment-date">{new Date(a.transaction_date).toLocaleDateString()}</div>
                    </div>
                    <div className="payment-val" style={{ textAlign: 'right' }}>
                      <div className="payment-amount">${parseFloat(a.customer_price).toLocaleString()}</div>
                      <div className="payment-notes" style={{ fontSize: '0.7rem' }}>Cost: ${parseFloat(a.cost_price).toLocaleString()}</div>
                      {a.description && <div className="payment-notes">{a.description}</div>}
                    </div>
                    {(isAdmin || isAccountant) && (
                      <button className="premium-btn premium-btn-danger" style={{ padding: '0.5rem' }} onClick={() => handlePaymentDelete(a.id)}>
                        <FaTrash />
                      </button>
                    )}
                  </div>
                ))}
                {payments.map((p) => (
                  <div key={p.id} className="payment-item">
                    <div className="payment-main">
                      <div className="payment-type">{p.payment_type.toUpperCase()}</div>
                      <div className="payment-date">{new Date(p.payment_date).toLocaleDateString()}</div>
                    </div>
                    <div className="payment-val" style={{ textAlign: 'right' }}>
                      <div className="payment-amount">${parseFloat(p.amount).toLocaleString()}</div>
                      {p.notes && <div className="payment-notes">{p.notes}</div>}
                    </div>
                    {(isAdmin || isAccountant) && (
                      <button className="premium-btn premium-btn-danger" style={{ padding: '0.5rem' }} onClick={() => handlePaymentDelete(p.id)}>
                        <FaTrash />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Record Transaction</h2>
            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label>Payment Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Type</label>
                  <select
                    value={paymentForm.payment_type}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value })}
                  >
                    <option value="installment">Installment</option>
                    <option value="booking">Booking</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Transaction Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAdjustmentModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustmentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Adjustment Form</h2>
            <form onSubmit={handleAdjustmentSubmit}>
              <div className="form-group">
                <label>Customer Price (Credit toward deal) *</label>
                <input
                  type="number"
                  value={adjustmentForm.customer_price}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, customer_price: e.target.value })}
                  required
                  placeholder="e.g. 40000"
                />
              </div>
              <div className="form-group">
                <label>Cost Price (Deducted from Cert. Balance) *</label>
                <input
                  type="number"
                  value={adjustmentForm.cost_price}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, cost_price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={adjustmentForm.adjustment_date}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, adjustment_date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={adjustmentForm.notes}
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
                  rows="2"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowAdjustmentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  Apply Adjustment
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
