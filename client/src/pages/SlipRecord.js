import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaFileImport, FaReceipt } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import Pagination from '../components/Pagination';
import './SlipRecord.css';
import { notify, confirmDialog } from '../utils/notify';

const SLIP_STATUS_LABELS = {
  available: 'Available',
  given_out: 'Given Out',
  used: 'Used',
  lost: 'Lost',
};

const SLIP_COLUMNS = [
  { key: 'slip_date', label: 'Date', type: 'date' },
  { key: 'plot_number', label: 'Plot', type: 'text' },
  { key: 'block', label: 'Block', type: 'text' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'slip_no', label: 'Receipt', type: 'text' },
  { key: 'referred_by', label: 'Estate / Office', type: 'text' },
  { key: 'installment_amount', label: 'Installment', type: 'currency' },
  { key: 'investment_value', label: 'Investment Value', type: 'currency' },
  { key: 'form_qty', label: 'Form Qty', type: 'number' },
  { key: 'slip_owner', label: 'Slip Owner', type: 'text' },
  { key: 'slip_status', label: 'Slip Status', type: 'enum', formatOption: (v) => SLIP_STATUS_LABELS[v] || v },
];

const emptySlipForm = {
  deal_id: '',
  slip_no: '',
  slip_date: new Date().toISOString().split('T')[0],
  plot_number: '',
  block: '',
  size: '',
  referred_by: '',
  installment_amount: '',
  investment_value: '',
  form_qty: '',
  slip_owner: 'Universal Holdings',
  slip_status: 'available',
  given_to: '',
  given_date: '',
  notes: '',
};

const SlipRecord = () => {
  const navigate = useNavigate();
  const { isAdmin, isAccountant } = useAuth();
  const canManage = isAdmin || isAccountant;

  const [slips, setSlips] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [slipForm, setSlipForm] = useState(emptySlipForm);
  const [formsCustomerValue, setFormsCustomerValue] = useState(40000);

  useEffect(() => {
    fetchSlips();
    fetchDeals();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      const value = response.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_CUSTOMER_VALUE');
      if (value) setFormsCustomerValue(parseFloat(value.setting_value));
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  // CADN receipts are always forms, historically sometimes logged as a plain cash
  // payment - keep the investment/qty split in sync as the user fills the form in.
  const applyCadnAutoCalc = (next) => {
    const isCadn = String(next.slip_no || '').toUpperCase().includes('CADN');
    const installment = parseFloat(next.installment_amount) || 0;
    if (isCadn && installment > 0) {
      next.investment_value = (installment / 2).toFixed(2);
      next.form_qty = Math.round(installment / formsCustomerValue);
    }
    return next;
  };

  const fetchSlips = async () => {
    try {
      const response = await api.get('/slips');
      setSlips(response.data);
    } catch (error) {
      console.error('Error fetching slips:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeals = async () => {
    try {
      const response = await api.get('/deals');
      setDeals(response.data);
    } catch (error) {
      console.error('Error fetching deals:', error);
    }
  };

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredSlips,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
    pagedData: pagedSlips, pagination,
  } = useTableFilters(slips, SLIP_COLUMNS);

  const totals = filteredSlips.reduce((acc, s) => ({
    installment: acc.installment + parseFloat(s.installment_amount || 0),
    investment: acc.investment + parseFloat(s.investment_value || 0),
    forms: acc.forms + (parseInt(s.form_qty, 10) || 0),
  }), { installment: 0, investment: 0, forms: 0 });

  const handleDealChange = async (dealId) => {
    setSlipForm(prev => ({ ...prev, deal_id: dealId }));
    if (!dealId) return;
    try {
      const response = await api.get(`/deals/${dealId}`);
      const deal = response.data;
      const plots = deal.plots || [];
      setSlipForm(prev => ({
        ...prev,
        plot_number: plots.map(p => p.plot_number).filter(Boolean).join(', ') || prev.plot_number,
        block: plots[0]?.block || prev.block,
        size: plots[0]?.size || prev.size,
        referred_by: deal.agency_name || deal.dealer_name || prev.referred_by,
      }));
    } catch (error) {
      console.error('Error fetching deal details:', error);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setSlipForm(emptySlipForm);
    setShowModal(true);
  };

  const openEditModal = (slip) => {
    setEditingId(slip.id);
    setSlipForm({
      deal_id: slip.deal_id || '',
      slip_no: slip.slip_no || '',
      slip_date: slip.slip_date ? slip.slip_date.split('T')[0] : new Date().toISOString().split('T')[0],
      plot_number: slip.plot_number || '',
      block: slip.block || '',
      size: slip.size || '',
      referred_by: slip.referred_by || '',
      installment_amount: slip.installment_amount || '',
      investment_value: slip.investment_value || '',
      form_qty: slip.form_qty || '',
      slip_owner: slip.slip_owner || 'Universal Holdings',
      slip_status: slip.slip_status || 'available',
      given_to: slip.given_to || '',
      given_date: slip.given_date ? slip.given_date.split('T')[0] : '',
      notes: slip.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setSlipForm(emptySlipForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...slipForm, deal_id: slipForm.deal_id || null };
      if (editingId) {
        await api.put(`/slips/${editingId}`, payload);
      } else {
        await api.post('/slips', payload);
      }
      fetchSlips();
      closeModal();
    } catch (error) {
      notify(error.response?.data?.message || 'Error saving slip record');
    }
  };

  const handleDelete = async (id) => {
    if (!await confirmDialog('Delete this slip record permanently?')) return;
    try {
      await api.delete(`/slips/${id}`);
      fetchSlips();
    } catch (error) {
      notify(error.response?.data?.message || 'Error deleting slip record');
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const response = await api.post('/slips/import');
      const { pulled, fixed } = response.data;
      notify(`Pulled ${pulled} new slip(s) from existing receipts.`
        + (fixed ? ` Corrected ${fixed} CADN slip(s) to the forms investment/qty split.` : ''));
      fetchSlips();
    } catch (error) {
      notify(error.response?.data?.message || 'Error pulling existing receipts');
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="slip-record-loading">Loading Slip Record...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Slip Record</h1>
          <p>Track every receipt slip issued against a deal - who holds it and its current status.</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="premium-btn premium-btn-secondary" onClick={handleImport} disabled={importing}>
              <FaFileImport /> {importing ? 'Pulling...' : 'Pull Existing Receipts'}
            </button>
            <button className="premium-btn premium-btn-primary" onClick={openCreateModal}>
              <FaPlus /> Add Slip
            </button>
          </div>
        )}
      </div>

      <div className="slip-summary-container">
        <div className="summary-card glass-card">
          <span className="summary-label">Total Slips</span>
          <span className="summary-value">{filteredSlips.length}</span>
        </div>
        <div className="summary-card glass-card">
          <span className="summary-label">Total Installment</span>
          <span className="summary-value amount">Rs. {totals.installment.toLocaleString()}</span>
        </div>
        <div className="summary-card glass-card">
          <span className="summary-label">Total Investment Value</span>
          <span className="summary-value">Rs. {totals.investment.toLocaleString()}</span>
        </div>
        <div className="summary-card glass-card">
          <span className="summary-label">Total Form Qty</span>
          <span className="summary-value">{totals.forms}</span>
        </div>
      </div>

      <div className="glass-card">
        <TableToolbar
          columns={SLIP_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search slips by receipt #, plot, estate/office..."
          resultCount={filteredSlips.length}
        />
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Date</th>
                <th>Plot</th>
                <th>Block</th>
                <th>Size</th>
                <th>Receipt</th>
                <th>Estate / Office</th>
                <th style={{ textAlign: 'right' }}>Installment</th>
                <th style={{ textAlign: 'right' }}>Investment Value</th>
                <th style={{ textAlign: 'right' }}>Form Qty</th>
                <th>Slip Owner</th>
                <th>Slip Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredSlips.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 13 : 12} className="empty-state">
                    {slips.length === 0 ? 'No slip records yet.' : 'No slips match the current search/filter criteria.'}
                  </td>
                </tr>
              ) : (
                pagedSlips.map((s, idx) => (
                  <tr key={s.id}>
                    <td data-label="S.No">{(pagination.page - 1) * pagination.pageSize + idx + 1}</td>
                    <td data-label="Date">{new Date(s.slip_date).toLocaleDateString()}</td>
                    <td data-label="Plot">
                      {s.deal_id ? (
                        <button className="link-button" onClick={() => navigate(`/deals/${s.deal_id}`)}>
                          {s.plot_number || `Deal #${s.deal_id}`}
                        </button>
                      ) : (s.plot_number || '-')}
                    </td>
                    <td data-label="Block">{s.block || '-'}</td>
                    <td data-label="Size">{s.size || '-'}</td>
                    <td data-label="Receipt" style={{ fontWeight: 700 }}>{s.slip_no}</td>
                    <td data-label="Estate / Office">{s.referred_by || '-'}</td>
                    <td data-label="Installment" className="amount-cell" style={{ textAlign: 'right' }}>
                      Rs. {parseFloat(s.installment_amount || 0).toLocaleString()}
                    </td>
                    <td data-label="Investment Value" style={{ textAlign: 'right' }}>
                      Rs. {parseFloat(s.investment_value || 0).toLocaleString()}
                    </td>
                    <td data-label="Form Qty" style={{ textAlign: 'right' }}>{s.form_qty || 0}</td>
                    <td data-label="Slip Owner">{s.slip_owner}</td>
                    <td data-label="Slip Status">
                      <span className={`premium-badge ${
                        s.slip_status === 'available' ? 'premium-badge-info' :
                        s.slip_status === 'given_out' ? 'premium-badge-warning' :
                        s.slip_status === 'used' ? 'premium-badge-neutral' : 'premium-badge-danger'
                      }`}>
                        {SLIP_STATUS_LABELS[s.slip_status] || s.slip_status}
                      </span>
                      {s.slip_status === 'given_out' && s.given_to && (
                        <div className="slip-given-note">
                          To {s.given_to}{s.given_date ? ` (${new Date(s.given_date).toLocaleDateString()})` : ''}
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <td data-label="Actions">
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="premium-btn premium-btn-secondary"
                            style={{ padding: '0.4rem 0.7rem' }}
                            onClick={() => openEditModal(s)}
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="premium-btn premium-btn-danger"
                            style={{ padding: '0.4rem 0.7rem' }}
                            onClick={() => handleDelete(s.id)}
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2><FaReceipt style={{ marginRight: '0.5rem' }} />{editingId ? 'Edit Slip Record' : 'Add Slip Record'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Link to Deal (optional)</label>
                <select value={slipForm.deal_id} onChange={(e) => handleDealChange(e.target.value)}>
                  <option value="">No linked deal</option>
                  {deals.map(d => (
                    <option key={d.id} value={d.id}>
                      #{d.id} - {d.customer_name || 'N/A'} {d.plot_number ? `(${d.plot_number})` : ''}
                    </option>
                  ))}
                </select>
                <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                  Auto-fills plot/block/size/estate-office below - still editable.
                </small>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Receipt / Slip # *</label>
                  <input
                    type="text"
                    value={slipForm.slip_no}
                    onChange={(e) => setSlipForm(applyCadnAutoCalc({ ...slipForm, slip_no: e.target.value }))}
                    placeholder="e.g. DINS-6318"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={slipForm.slip_date}
                    onChange={(e) => setSlipForm({ ...slipForm, slip_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Plot #</label>
                  <input
                    type="text"
                    value={slipForm.plot_number}
                    onChange={(e) => setSlipForm({ ...slipForm, plot_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Block</label>
                  <input
                    type="text"
                    value={slipForm.block}
                    onChange={(e) => setSlipForm({ ...slipForm, block: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Size</label>
                  <input
                    type="text"
                    value={slipForm.size}
                    onChange={(e) => setSlipForm({ ...slipForm, size: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Estate / Office</label>
                <input
                  type="text"
                  value={slipForm.referred_by}
                  onChange={(e) => setSlipForm({ ...slipForm, referred_by: e.target.value })}
                  placeholder="Referring agency or salesperson"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Installment (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={slipForm.installment_amount}
                    onChange={(e) => setSlipForm(applyCadnAutoCalc({ ...slipForm, installment_amount: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Investment Value (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={slipForm.investment_value}
                    onChange={(e) => setSlipForm({ ...slipForm, investment_value: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Form Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={slipForm.form_qty}
                    onChange={(e) => setSlipForm({ ...slipForm, form_qty: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1.5rem' }}>
                <div className="form-group">
                  <label>Slip Owner</label>
                  <input
                    type="text"
                    value={slipForm.slip_owner}
                    onChange={(e) => setSlipForm({ ...slipForm, slip_owner: e.target.value })}
                    placeholder="e.g. Universal Holdings"
                  />
                </div>
                <div className="form-group">
                  <label>Slip Status</label>
                  <select
                    value={slipForm.slip_status}
                    onChange={(e) => setSlipForm({ ...slipForm, slip_status: e.target.value })}
                  >
                    <option value="available">Available</option>
                    <option value="given_out">Given Out</option>
                    <option value="used">Used</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>

              {slipForm.slip_status === 'given_out' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label>Given To</label>
                    <input
                      type="text"
                      value={slipForm.given_to}
                      onChange={(e) => setSlipForm({ ...slipForm, given_to: e.target.value })}
                      placeholder="Name of recipient"
                    />
                  </div>
                  <div className="form-group">
                    <label>Given Date</label>
                    <input
                      type="date"
                      value={slipForm.given_date}
                      onChange={(e) => setSlipForm({ ...slipForm, given_date: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={slipForm.notes}
                  onChange={(e) => setSlipForm({ ...slipForm, notes: e.target.value })}
                  rows="2"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingId ? 'Update Slip' : 'Save Slip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlipRecord;
