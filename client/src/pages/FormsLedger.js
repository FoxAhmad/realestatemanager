import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FaFileContract, FaPlus, FaCog, FaChevronDown, FaChevronUp, FaTimes } from 'react-icons/fa';
import './FormsLedger.css';

const FormsLedger = () => {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dealers, setDealers] = useState([]);
  const [expandedDealerId, setExpandedDealerId] = useState(null);
  const [dealerHistory, setDealerHistory] = useState({});

  const [basePrice, setBasePrice] = useState(20000);
  const [defaultCurrentValue, setDefaultCurrentValue] = useState(40000);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ basePrice: '', defaultCurrentValue: '' });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    user_id: '',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    fetchSummary();
    fetchDealers();
    fetchSettings();
  }, []);

  const fetchSummary = async () => {
    try {
      const response = await api.get('/balance-transactions/forms/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching forms summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDealers = async () => {
    try {
      const response = await api.get('/dealers');
      setDealers(response.data);
    } catch (error) {
      console.error('Error fetching dealers:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      const cost = response.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_DEFAULT_COST');
      const value = response.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_CUSTOMER_VALUE');
      if (cost) setBasePrice(parseFloat(cost.setting_value));
      if (value) setDefaultCurrentValue(parseFloat(value.setting_value));
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const toggleDealer = async (dealerId) => {
    if (expandedDealerId === dealerId) {
      setExpandedDealerId(null);
      return;
    }
    setExpandedDealerId(dealerId);
    if (dealerHistory[dealerId]) return;
    try {
      const response = await api.get(`/balance-transactions/8?userId=${dealerId}`);
      setDealerHistory(prev => ({ ...prev, [dealerId]: response.data }));
    } catch (error) {
      console.error('Error fetching dealer forms history:', error);
    }
  };

  const openSettings = () => {
    setSettingsForm({ basePrice: basePrice.toString(), defaultCurrentValue: defaultCurrentValue.toString() });
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    try {
      await api.put('/settings/ADJUSTMENT_FORM_DEFAULT_COST', { value: settingsForm.basePrice });
      await api.put('/settings/ADJUSTMENT_FORM_CUSTOMER_VALUE', { value: settingsForm.defaultCurrentValue });
      setBasePrice(parseFloat(settingsForm.basePrice));
      setDefaultCurrentValue(parseFloat(settingsForm.defaultCurrentValue));
      setShowSettings(false);
    } catch (error) {
      alert(error.response?.data?.message || 'Error saving settings');
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const qty = parseInt(addForm.quantity) || 1;
      await api.post('/balance-transactions', {
        account_id: 8,
        user_id: addForm.user_id,
        amount: (qty * basePrice).toString(),
        type: 'add',
        date: addForm.date,
        description: addForm.notes || 'Forms issued to dealer',
        quantity: qty,
      });
      setShowAddModal(false);
      setAddForm({ user_id: '', quantity: 1, date: new Date().toISOString().split('T')[0], notes: '' });
      setDealerHistory({});
      fetchSummary();
    } catch (error) {
      alert(error.response?.data?.message || 'Error issuing forms');
    }
  };

  if (loading) {
    return <div className="inventory-loading">Loading forms ledger...</div>;
  }

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-page-title">Forms Ledger</h1>
          <p>Track how many adjustment forms each dealer currently holds.</p>
        </div>
        <div className="header-actions">
          <button className="premium-btn premium-btn-secondary" onClick={openSettings}>
            <FaCog /> Settings
          </button>
          <button className="premium-btn premium-btn-primary" onClick={() => setShowAddModal(true)}>
            <FaPlus /> Issue Forms
          </button>
        </div>
      </div>

      <div className="forms-price-strip">
        <div className="forms-price-chip">
          <span className="label">Base Price / Form</span>
          <span className="value">Rs. {basePrice.toLocaleString()}</span>
        </div>
        <div className="forms-price-chip">
          <span className="label">Default Current Value</span>
          <span className="value">Rs. {defaultCurrentValue.toLocaleString()}</span>
        </div>
        <div className="forms-price-note">Current value varies per use — it's editable each time a form is applied to a deal.</div>
      </div>

      <div className="glass-card">
        {summary.length === 0 ? (
          <div className="empty-state">No dealer currently holds any forms.</div>
        ) : (
          <div className="forms-dealer-list">
            {summary.map((d) => {
              const isExpanded = expandedDealerId === d.dealer_id;
              const history = dealerHistory[d.dealer_id];
              return (
                <div key={d.dealer_id} className="forms-dealer-card glass-card">
                  <div className="forms-dealer-row" onClick={() => toggleDealer(d.dealer_id)}>
                    <div className="forms-dealer-icon"><FaFileContract /></div>
                    <div className="forms-dealer-info">
                      <div className="forms-dealer-name">{d.dealer_name}</div>
                      <div className="forms-dealer-sub">Rs. {parseFloat(d.balance || 0).toLocaleString()} balance on account</div>
                    </div>
                    <div className="forms-dealer-count">
                      <span className="count-val">{d.forms_held}</span>
                      <span className="count-label">Forms Held</span>
                    </div>
                    <div className="forms-dealer-value">
                      <span className="value-val">Rs. {(d.forms_held * defaultCurrentValue).toLocaleString()}</span>
                      <span className="value-label">Est. Value</span>
                    </div>
                    <button className="expand-btn">
                      {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="forms-dealer-history">
                      {!history ? (
                        <p>Loading history...</p>
                      ) : history.length === 0 ? (
                        <p>No entries yet.</p>
                      ) : (
                        <table className="premium-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Description</th>
                              <th>Qty</th>
                              <th>Credit</th>
                              <th>Debit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map(h => (
                              <tr key={h.line_id}>
                                <td>{new Date(h.transaction_date).toLocaleDateString()}</td>
                                <td>{h.description}</td>
                                <td>{h.quantity}</td>
                                <td style={{ color: 'var(--success)' }}>{parseFloat(h.credit) > 0 ? parseFloat(h.credit).toLocaleString() : '-'}</td>
                                <td style={{ color: 'var(--danger)' }}>{parseFloat(h.debit) > 0 ? parseFloat(h.debit).toLocaleString() : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ border: 'none', marginBottom: 0, paddingBottom: 0 }}>Forms Settings</h2>
              <button className="close-modal-btn" onClick={() => setShowSettings(false)}><FaTimes /></button>
            </div>
            <div className="form-group">
              <label>Base Price / Form (Rs.) *</label>
              <input
                type="number"
                value={settingsForm.basePrice}
                onChange={(e) => setSettingsForm({ ...settingsForm, basePrice: e.target.value })}
                required
              />
              <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                Fixed cost of issuing a form. Used to calculate the amount when issuing forms to a dealer.
              </small>
            </div>
            <div className="form-group">
              <label>Default Current Value (Rs.) *</label>
              <input
                type="number"
                value={settingsForm.defaultCurrentValue}
                onChange={(e) => setSettingsForm({ ...settingsForm, defaultCurrentValue: e.target.value })}
                required
              />
              <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                Suggested value credited toward a deal per form. Can be overridden per use since form value varies day to day.
              </small>
            </div>
            <div className="modal-actions">
              <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
              <button type="button" className="premium-btn premium-btn-primary" onClick={handleSaveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Issue Forms to Dealer</h2>
            <form onSubmit={handleAddSubmit}>
              <div className="form-group">
                <label>Dealer *</label>
                <select
                  value={addForm.user_id}
                  onChange={(e) => setAddForm({ ...addForm, user_id: e.target.value })}
                  required
                >
                  <option value="">Select dealer</option>
                  {dealers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity (Number of Forms) *</label>
                <input
                  type="number"
                  min="1"
                  value={addForm.quantity}
                  onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Amount (Rs.)</label>
                <input type="text" value={`Rs. ${((parseInt(addForm.quantity) || 0) * basePrice).toLocaleString()}`} disabled />
                <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                  Calculated as Quantity &times; Base Price (Rs. {basePrice.toLocaleString()})
                </small>
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  rows="2"
                  placeholder="Optional notes"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormsLedger;
