import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaArrowLeft, FaPlus, FaTrash, FaEdit, FaFileInvoiceDollar, FaFileContract, FaUser, FaMapMarkerAlt, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './DealDetail.css';

const LEDGER_COLUMNS = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'type', label: 'Type', type: 'enum' },
  { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

const DealDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAccountant } = useAuth();
  const [deal, setDeal] = useState(null);
  const [payments, setPayments] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null);
  const [expandedAdjustments, setExpandedAdjustments] = useState({});
  const [dealers, setDealers] = useState([]);
  const [defaultCost, setDefaultCost] = useState(20000);
  const [defaultCustomerValue, setDefaultCustomerValue] = useState(40000);
  const emptyPaymentForm = {
    amount: '',
    payment_type: 'installment',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
    instrument: 'cash',
    instrument_number: '',
    voucher_no: '',
    lps_amount: '',
    installment_no: '',
    apply_adjustment: false,
    adjustment_user_id: '',
    adjustment_quantity: 1,
    adjustment_price: 40000,
    adjustment_voucher_no: '',
  };
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);

  const fetchDealDetails = useCallback(async () => {
    try {
      const dealRes = await api.get(`/deals/${id}`);
      setDeal(dealRes.data);
      setPayments(dealRes.data.payments || []);

      // Fetch adjustments
      const adjRes = await api.get(`/balance-transactions/8?deal_id=${id}`);
      // Filtering for this deal if not already filtered by backend
      setAdjustments(adjRes.data.filter(a => a.reference_id === parseInt(id)));

      // Fetch settings
      const settingsRes = await api.get('/settings');
      const costSetting = settingsRes.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_DEFAULT_COST');
      const valueSetting = settingsRes.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_CUSTOMER_VALUE');

      let cost = 20000;
      let val = 40000;

      if (costSetting) {
        cost = parseFloat(costSetting.setting_value);
        setDefaultCost(cost);
      }
      if (valueSetting) {
        val = parseFloat(valueSetting.setting_value);
        setDefaultCustomerValue(val);
      }

      setPaymentForm(prev => ({
        ...prev,
        adjustment_user_id: prev.adjustment_user_id || dealRes.data.dealer_id, // Default to deal's dealer
        adjustment_price: prev.adjustment_quantity ? val * prev.adjustment_quantity : val
      }));

      // Fetch dealers
      const dealersRes = await api.get('/dealers');
      setDealers(dealersRes.data);
    } catch (error) {
      console.error('Error fetching deal details:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDealDetails();
  }, [fetchDealDetails]);

  const ledgerEntries = useMemo(() => {
    const adjustmentsByPayment = {};
    const unlinkedAdjustments = [];
    adjustments.forEach((a) => {
      if (a.payment_id) {
        adjustmentsByPayment[a.payment_id] = a;
      } else {
        unlinkedAdjustments.push(a);
      }
    });

    return [
      ...unlinkedAdjustments.map((a) => ({
        id: `adj-${a.id}`,
        _kind: 'adjustment',
        _raw: a,
        date: a.transaction_date,
        type: 'Adjustment',
        amount: parseFloat(a.customer_price || 0),
        notes: a.description || a.notes || '',
      })),
      ...payments.map((p) => ({
        id: `pay-${p.id}`,
        _kind: 'payment',
        _raw: p,
        _adjustment: adjustmentsByPayment[p.id] || null,
        date: p.payment_date,
        type: p.payment_type,
        amount: parseFloat(p.amount || 0),
        notes: p.notes || '',
      })),
    ];
  }, [adjustments, payments]);

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredLedgerEntries,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(ledgerEntries, LEDGER_COLUMNS);

  // Group payment entries so every receipt against the same installment (or the
  // same one-off type, e.g. all "Form Fee" lines) sits together instead of being
  // interleaved by date. Groups are ordered by their natural place in the payment
  // schedule: Down Payment, Form Fee, then installments in numeric order, then
  // Excess Area / Possession Fee / Other.
  const groupedPaymentEntries = useMemo(() => {
    const groups = {};
    filteredLedgerEntries
      .filter((e) => e._kind === 'payment')
      .forEach((entry) => {
        const p = entry._raw;
        const isNumberedInstallment = p.payment_type === 'installment' && p.installment_no;
        const key = isNumberedInstallment ? `installment:${p.installment_no}` : `type:${p.payment_type}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            label: isNumberedInstallment ? `${p.installment_no} Installment` : p.payment_type.replace('_', ' ').toUpperCase(),
            entries: [],
          };
        }
        groups[key].entries.push(entry);
      });

    const rankOf = (group) => {
      const first = group.entries[0]._raw;
      if (first.payment_type === 'down_payment') return -2;
      if (first.payment_type === 'form_fee') return -1;
      if (first.payment_type === 'installment' && first.installment_no) {
        const n = parseInt(first.installment_no, 10);
        return Number.isNaN(n) ? 500 : n;
      }
      if (first.payment_type === 'possession_fee') return 900;
      if (first.payment_type === 'excess_area') return 950;
      return 999;
    };

    return Object.values(groups)
      .map((group) => ({
        ...group,
        entries: group.entries.slice().sort((a, b) => new Date(a.date) - new Date(b.date)),
        total: group.entries.reduce((sum, e) => sum + e.amount, 0),
      }))
      .sort((a, b) => rankOf(a) - rankOf(b));
  }, [filteredLedgerEntries]);

  const handleEditPayment = (p) => {
    const linkedAdj = adjustments.find(a => a.payment_id === p.id);
    setEditingPaymentId(p.id);
    setEditingAdjustmentId(linkedAdj ? linkedAdj.id : null);
    setPaymentForm({
      ...emptyPaymentForm,
      amount: p.amount,
      payment_type: p.payment_type,
      payment_date: p.payment_date ? p.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
      notes: p.notes || '',
      instrument: p.instrument || 'cash',
      instrument_number: p.instrument_number || '',
      voucher_no: p.voucher_no || '',
      lps_amount: p.lps_amount || '',
      installment_no: p.installment_no || '',
      apply_adjustment: !!linkedAdj,
      adjustment_user_id: linkedAdj ? linkedAdj.user_id : (deal.dealer_id || ''),
      adjustment_quantity: linkedAdj ? linkedAdj.quantity : 1,
      adjustment_price: linkedAdj ? parseFloat(linkedAdj.customer_price) : defaultCustomerValue,
      adjustment_voucher_no: linkedAdj ? (linkedAdj.voucher_no || '') : '',
    });
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setEditingPaymentId(null);
    setEditingAdjustmentId(null);
    setPaymentForm({ ...emptyPaymentForm, adjustment_user_id: deal.dealer_id, adjustment_price: defaultCustomerValue });
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const {
        apply_adjustment, adjustment_user_id, adjustment_quantity, adjustment_price, adjustment_voucher_no,
        ...paymentPayload
      } = paymentForm;

      let paymentId = editingPaymentId;
      if (editingPaymentId) {
        await api.put(`/payments/${editingPaymentId}`, paymentPayload);
      } else {
        const paymentRes = await api.post('/payments', { ...paymentPayload, deal_id: id });
        paymentId = paymentRes.data.id;
      }

      if (apply_adjustment) {
        const qty = parseInt(adjustment_quantity) || 1;
        const adjustmentPayload = {
          user_id: adjustment_user_id || deal.dealer_id,
          quantity: qty,
          customer_price: adjustment_price || (qty * defaultCustomerValue),
          cost_price: qty * defaultCost,
          date: paymentForm.payment_date,
          notes: `Adjustment applied with ${paymentForm.payment_type.replace('_', ' ')} payment`,
          voucher_no: adjustment_voucher_no || null,
        };

        if (editingAdjustmentId) {
          await api.put(`/balance-transactions/adjust-deal/${editingAdjustmentId}`, adjustmentPayload);
        } else {
          await api.post('/balance-transactions/adjust-deal', {
            ...adjustmentPayload,
            deal_id: id,
            payment_id: paymentId,
          });
        }
      }

      fetchDealDetails();
      closePaymentModal();
    } catch (error) {
      console.error('Error recording payment:', error);
      alert(error.response?.data?.message || 'Error recording payment');
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      await api.put(`/deals/${id}`, { status: newStatus });
      fetchDealDetails();
    } catch (error) {
      alert('Error updating status');
    }
  };

  const handlePaymentDelete = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      try {
        await api.delete(`/payments/${paymentId}`);
        fetchDealDetails();
      } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
      }
    }
  };

  const handleAdjustmentDelete = async (transactionId) => {
    if (window.confirm('Are you sure you want to delete this adjustment record?')) {
      try {
        await api.delete(`/balance-transactions/${transactionId}`);
        fetchDealDetails();
      } catch (error) {
        console.error('Error deleting adjustment:', error);
        alert('Error deleting adjustment');
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
          <div className="profile-header-main">
            <h1>Deal Profile #{id}</h1>
            {(isAdmin || isAccountant) ? (
              <select
                className={`status-select-premium ${deal.status}`}
                value={deal.status}
                onChange={(e) => handleStatusUpdate(e.target.value)}
              >
                <option value="in_progress">IN PROGRESS</option>
                <option value="deal_done">DONE / CLOSED</option>
                <option value="deal_not_done">CANCELLED</option>
              </select>
            ) : (
              <div className={`status-badge-premium ${deal.status}`}>
                {deal.status?.replace('_', ' ').toUpperCase()}
              </div>
            )}
          </div>
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
                <span>{deal.cnic || 'N/A'}</span>
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
                <span style={{ color: 'var(--primary)', fontWeight: 800 }}>
                  {deal.plots && deal.plots.length > 0
                    ? deal.plots.map(p => p.plot_number).join(', ')
                    : (deal.plot_info || 'N/A')}
                </span>
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
                <span className="amount">Rs. {parseFloat(deal.sale_price || 0).toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Paid Amount</label>
                <span className="amount" style={{ color: 'var(--success)' }}>Rs. {totalPaid.toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Cert. Adjustments</label>
                <span className="amount" style={{ color: '#ffc107' }}>Rs. {totalAdjusted.toLocaleString()}</span>
              </div>
              <div className="summary-item">
                <label>Remaining</label>
                <span className="amount remaining">Rs. {remainingBalance.toLocaleString()}</span>
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
                <button className="premium-btn premium-btn-primary" onClick={() => { setEditingPaymentId(null); setShowPaymentModal(true); }}>
                  <FaPlus /> Post Payment
                </button>
              )}
            </div>
          </div>

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
            searchPlaceholder="Search ledger entries by type, notes..."
            resultCount={filteredLedgerEntries.length}
          />
          <div className="payments-list">
            {filteredLedgerEntries.length === 0 ? (
              <div className="empty-state">
                {ledgerEntries.length === 0
                  ? 'No financial records found for this deal.'
                  : 'No ledger entries match the current search/filter criteria.'}
              </div>
            ) : (
              <>
                {filteredLedgerEntries.filter((e) => e._kind === 'adjustment').map(({ _raw: a }) => (
                  <div key={`adj-${a.id}`} className="payment-item" style={{ borderLeft: '4px solid #ffc107' }}>
                    <div className="payment-main">
                      <div className="payment-type" style={{ background: '#ffc107', color: '#000' }}>
                        ADJUSTMENT {a.quantity > 1 ? `(${a.quantity} Forms)` : ''}
                      </div>
                      <div className="payment-date">{new Date(a.transaction_date).toLocaleDateString()}</div>
                    </div>
                    <div className="payment-val" style={{ textAlign: 'right' }}>
                      <div className="payment-amount">
                        Rs. {parseFloat(a.customer_price).toLocaleString()}
                        {a.quantity && <span className="qty-badge"> (Qty: {a.quantity})</span>}
                      </div>
                      <div className="payment-notes" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Cost: Rs. {parseFloat(a.cost_price).toLocaleString()}
                      </div>
                      {a.description && <div className="payment-notes">{a.description}</div>}
                      {(a.plot_info || a.customer_info) && (
                        <div className="payment-notes" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                          {a.customer_info && <span><FaUser size={8} /> {a.customer_info} </span>}
                          {a.plot_info && <span><FaMapMarkerAlt size={8} /> {a.plot_info}</span>}
                        </div>
                      )}
                    </div>
                    {(isAdmin || isAccountant) && (
                      <button className="premium-btn premium-btn-danger" style={{ padding: '0.5rem' }} onClick={() => handleAdjustmentDelete(a.id)}>
                        <FaTrash />
                      </button>
                    )}
                  </div>
                ))}
                {groupedPaymentEntries.map((group) => (
                  <div key={group.key} className="ledger-group">
                    <div className="ledger-group-header">
                      <span className="ledger-group-label">{group.label}</span>
                      <span className="ledger-group-total">
                        Rs. {group.total.toLocaleString()} · {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div className="ledger-group-items">
                      {group.entries.map(({ _raw: p, _adjustment }) => (
                        <React.Fragment key={p.id}>
                        <div className="payment-item">
                          <div className="payment-main" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {_adjustment && (
                              <button
                                type="button"
                                className="expand-btn"
                                title="View linked adjustment"
                                onClick={() => setExpandedAdjustments(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                              >
                                {expandedAdjustments[p.id] ? <FaChevronUp /> : <FaChevronDown />}
                              </button>
                            )}
                            <div>
                              <div className="payment-type">
                                {p.payment_type.replace('_', ' ').toUpperCase()}
                                {p.installment_no && ` · ${p.installment_no}`}
                              </div>
                              <div className="payment-date">{new Date(p.payment_date).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className="payment-val" style={{ textAlign: 'right' }}>
                            <div className="payment-amount">Rs. {parseFloat(p.amount).toLocaleString()}</div>
                            {_adjustment && (
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b45309' }}>
                                Total incl. Adjustment: Rs. {(parseFloat(p.amount) + parseFloat(_adjustment.customer_price || 0)).toLocaleString()}
                              </div>
                            )}
                            {(p.instrument || p.instrument_number || p.voucher_no) && (
                              <div className="payment-notes" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {p.instrument ? p.instrument.replace('_', ' ').toUpperCase() : ''}
                                {p.instrument_number ? ` # ${p.instrument_number}` : ''}
                                {p.voucher_no ? ` · ${p.voucher_no}` : ''}
                              </div>
                            )}
                            {parseFloat(p.lps_amount || 0) > 0 && (
                              <div className="payment-notes" style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>
                                LPS: Rs. {parseFloat(p.lps_amount).toLocaleString()}
                              </div>
                            )}
                            {p.notes && <div className="payment-notes">{p.notes}</div>}
                          </div>
                          {(isAdmin || isAccountant) && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="premium-btn premium-btn-secondary" style={{ padding: '0.5rem' }} title="Edit payment" onClick={() => handleEditPayment(p)}>
                                <FaEdit />
                              </button>
                              <button className="premium-btn premium-btn-danger" style={{ padding: '0.5rem' }} onClick={() => handlePaymentDelete(p.id)}>
                                <FaTrash />
                              </button>
                            </div>
                          )}
                        </div>
                        {_adjustment && expandedAdjustments[p.id] && (
                          <div className="linked-entries-detail">
                            <h4><FaFileContract color="#ffc107" /> Linked Adjustment Form</h4>
                            <div className="linked-grid">
                              <div className="linked-item-card">
                                <div className="linked-item-header">
                                  <span className="date">{new Date(_adjustment.transaction_date).toLocaleDateString()}</span>
                                  {_adjustment.quantity > 1 && (
                                    <span className="dealer-badge" style={{ fontSize: '0.95rem', padding: '0.25rem 0.65rem' }}>
                                      Qty: {_adjustment.quantity}
                                    </span>
                                  )}
                                </div>
                                <div className="linked-item-body">
                                  <span className="amount">Rs. {parseFloat(_adjustment.customer_price).toLocaleString()}</span>
                                  {_adjustment.user_name && <p>{_adjustment.user_name}</p>}
                                  {_adjustment.voucher_no && (
                                    <div className="payment-notes" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                      Form Receipt: {_adjustment.voucher_no}
                                    </div>
                                  )}
                                </div>
                                {(isAdmin || isAccountant) && (
                                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                    <button
                                      className="premium-btn premium-btn-secondary"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                                      onClick={() => handleEditPayment(p)}
                                    >
                                      <FaEdit size={10} /> Edit
                                    </button>
                                    <button
                                      className="premium-btn premium-btn-danger"
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                                      onClick={() => handleAdjustmentDelete(_adjustment.id)}
                                    >
                                      <FaTrash size={10} /> Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="modal-overlay" onClick={closePaymentModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingPaymentId ? 'Edit Transaction' : 'Record Transaction'}</h2>
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
                    onChange={(e) => setPaymentForm({
                      ...paymentForm,
                      payment_type: e.target.value,
                      apply_adjustment: e.target.value === 'installment' ? paymentForm.apply_adjustment : false,
                    })}
                  >
                    <option value="down_payment">Booking / Down Payment</option>
                    <option value="installment">Installment</option>
                    <option value="excess_area">Excess Area</option>
                    <option value="possession_fee">Possession Fee</option>
                    <option value="form_fee">Form Fee</option>
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
              {paymentForm.payment_type === 'installment' && (
                <div className="form-group">
                  <label>Installment #</label>
                  <input
                    type="text"
                    list="installment-no-options"
                    value={paymentForm.installment_no}
                    onChange={(e) => setPaymentForm({ ...paymentForm, installment_no: e.target.value })}
                    placeholder="e.g. 1st, 2nd, 3rd..."
                  />
                  <datalist id="installment-no-options">
                    {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'].map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Instrument Type</label>
                  <select
                    value={paymentForm.instrument}
                    onChange={(e) => setPaymentForm({ ...paymentForm, instrument: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="pay_order">Pay Order</option>
                    <option value="bank_transfer">Bank Transfer / Online</option>
                    <option value="cdn">Cross Cheque / CDN</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Instrument / Cheque No.</label>
                  <input
                    type="text"
                    value={paymentForm.instrument_number}
                    onChange={(e) => setPaymentForm({ ...paymentForm, instrument_number: e.target.value })}
                    placeholder="e.g. 9540"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>{paymentForm.apply_adjustment ? 'Cash Receipt / Voucher No.' : 'Receipt / Voucher No.'}</label>
                  <input
                    type="text"
                    value={paymentForm.voucher_no}
                    onChange={(e) => setPaymentForm({ ...paymentForm, voucher_no: e.target.value })}
                    placeholder="e.g. RCVD # 9540"
                  />
                </div>
                <div className="form-group">
                  <label>LPS Charged</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.lps_amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, lps_amount: e.target.value })}
                    placeholder="Late payment surcharge, if any"
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

              {(paymentForm.payment_type === 'installment' || editingAdjustmentId) && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    border: paymentForm.apply_adjustment ? '1px solid #ffc107' : '1px solid #e5e7eb',
                    background: paymentForm.apply_adjustment ? '#fffbea' : '#fafafa',
                    borderRadius: '10px',
                    padding: '1rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: !editingAdjustmentId ? 'pointer' : 'default', margin: 0 }}>
                    <input
                      type="checkbox"
                      disabled={!!editingAdjustmentId}
                      style={{ width: '1.1rem', height: '1.1rem', accentColor: '#ffc107' }}
                      checked={paymentForm.apply_adjustment}
                      onChange={(e) => setPaymentForm({ ...paymentForm, apply_adjustment: e.target.checked })}
                    />
                    <FaFileContract color="#ffc107" />
                    <span style={{ fontWeight: 700 }}>
                      {editingAdjustmentId ? 'Adjustment Form linked to this installment' : 'Apply an Adjustment Form against this installment'}
                    </span>
                  </label>
                  {editingAdjustmentId && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '0.5rem 0 0' }}>
                      Editing here updates the linked form. Use "Remove" on the form itself to delete it instead.
                    </p>
                  )}

                  {paymentForm.apply_adjustment && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #ffc107' }}>
                      <div className="form-group">
                        <label>Select Dealer *</label>
                        <select
                          value={paymentForm.adjustment_user_id}
                          onChange={(e) => setPaymentForm({ ...paymentForm, adjustment_user_id: e.target.value })}
                          required
                          className="form-control"
                        >
                          <option value="">Select Dealer</option>
                          {dealers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="form-group">
                          <label>Quantity (Number of Forms) *</label>
                          <input
                            type="number"
                            min="1"
                            value={paymentForm.adjustment_quantity}
                            onChange={(e) => {
                              const qty = parseInt(e.target.value) || 1;
                              setPaymentForm({
                                ...paymentForm,
                                adjustment_quantity: qty,
                                adjustment_price: qty * defaultCustomerValue,
                              });
                            }}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Price (Total Credit) *</label>
                          <input
                            type="number"
                            value={paymentForm.adjustment_price}
                            onChange={(e) => setPaymentForm({ ...paymentForm, adjustment_price: e.target.value })}
                            required
                          />
                          <small style={{ color: 'var(--text-muted)' }}>Unit: Rs. {defaultCustomerValue.toLocaleString()}</small>
                        </div>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, marginTop: '1rem' }}>
                        <label>Form Receipt / Voucher No.</label>
                        <input
                          type="text"
                          value={paymentForm.adjustment_voucher_no}
                          onChange={(e) => setPaymentForm({ ...paymentForm, adjustment_voucher_no: e.target.value })}
                          placeholder="e.g. RCVD # 9541 (forms portion)"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={closePaymentModal}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingPaymentId ? 'Update Payment' : 'Confirm Payment'}
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
