import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FaPlus, FaSearch, FaHistory, FaCog, FaFileUpload,
  FaWallet, FaCertificate, FaPiggyBank, FaTimes, FaExternalLinkAlt
} from 'react-icons/fa';
import './ManageBalances.css';

const ManageBalances = () => {
  const [activeTab, setActiveTab] = useState(3); // Default to Dealer Advances (ID 3)
  const [transactions, setTransactions] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [adjustmentCost, setAdjustmentCost] = useState(20000);

  // Form State
  const [formData, setFormData] = useState({
    amount: '',
    type: 'add',
    date: new Date().toISOString().split('T')[0],
    description: '',
    voucher_no: '',
    instrument: 'Cash',
    instrument_number: '',
    user_id: '',
    proof_file: null
  });

  const accounts = [
    { id: 3, name: 'Dealer Advances', icon: <FaWallet />, color: '#007bff' },
    { id: 8, name: 'Advance for Certificate', icon: <FaCertificate />, color: '#ffc107' },
    { id: 4, name: 'Savings Deposits', icon: <FaPiggyBank />, color: '#28a745' }
  ];

  useEffect(() => {
    fetchData();
    fetchDealers();
    fetchSettings();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/balance-transactions/${activeTab}`);
      setTransactions(res.data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDealers = async () => {
    try {
      const res = await api.get('/dealers');
      setDealers(res.data);
    } catch (err) {
      console.error('Error fetching dealers:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      const costSetting = res.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_DEFAULT_COST');
      if (costSetting) setAdjustmentCost(costSetting.setting_value);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, proof_file: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        data.append(key, formData[key]);
      });
      data.append('account_id', activeTab);

      await api.post('/balance-transactions', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowModal(false);
      setFormData({
        amount: '',
        type: 'add',
        date: new Date().toISOString().split('T')[0],
        description: '',
        voucher_no: '',
        instrument: 'Cash',
        instrument_number: '',
        user_id: '',
        proof_file: null
      });
      fetchData();
    } catch (err) {
      alert('Error creating transaction: ' + (err.response?.data?.message || err.message));
    }
  };

  const updateAdjustmentCost = async () => {
    try {
      await api.put('/settings/ADJUSTMENT_FORM_DEFAULT_COST', { value: adjustmentCost });
      setShowSettings(false);
      alert('Setting updated successfully');
    } catch (err) {
      alert('Error updating setting');
    }
  };

  const totalBalance = transactions.reduce((sum, t) => {
    return sum + (parseFloat(t.debit) - parseFloat(t.credit));
  }, 0);

  return (
    <div className="premium-page manage-balances-container">
      <div className="premium-page-header">
        <div>
          <h1>Balance Management</h1>
          <p>Manage Asset accounts with Union Town and track transaction proofs.</p>
        </div>
        <div className="header-actions">
          <button className="tab-btn" onClick={() => setShowSettings(true)} style={{ background: 'rgba(255,255,255,0.05)' }}>
            <FaCog /> Settings
          </button>
          <button className="add-btn" onClick={() => setShowModal(true)}>
            <FaPlus /> Add Transaction
          </button>
        </div>
      </div>

      <div className="balances-tabs">
        {accounts.map(acc => (
          <button
            key={acc.id}
            className={`tab-btn ${activeTab === acc.id ? 'active' : ''}`}
            onClick={() => setActiveTab(acc.id)}
          >
            {acc.icon} {acc.name}
          </button>
        ))}
      </div>

      <div className="balance-summary-cards">
        <div className="balance-card">
          <div className="card-icon" style={{ background: 'rgba(0,123,255,0.1)', color: '#007bff' }}>
            <FaWallet />
          </div>
          <div className="card-info">
            <h3>Current Total Balance</h3>
            <div className="amount">Rs. {totalBalance.toLocaleString()}</div>
          </div>
        </div>
        <div className="balance-card">
          <div className="card-icon" style={{ background: 'rgba(255,193,7,0.1)', color: '#ffc107' }}>
            <FaHistory />
          </div>
          <div className="card-info">
            <h3>Recent Transactions</h3>
            <div className="amount">{transactions.length} Records</div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher #</th>
                <th>Narration & Proof</th>
                <th>Dealer / Ref</th>
                <th className="amount-col">Debit (Add)</th>
                <th className="amount-col">Credit (Use)</th>
                <th className="amount-col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="empty-state">Loading transactions...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No transactions recorded for this account</td></tr>
              ) : (
                transactions.map((t, idx) => {
                  // Calculate running balance for display
                  const runningBalance = transactions.slice(idx).reduce((sum, item) => {
                    return sum + (parseFloat(item.debit) - parseFloat(item.credit));
                  }, 0);

                  return (
                    <tr key={t.id}>
                      <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                      <td>
                        {t.voucher_no && <span className="voucher-badge">{t.voucher_no}</span>}
                        <div className="instrument-tag">{t.instrument} {t.instrument_number}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.description}</div>
                        {t.proof_file && (
                          <a href={(process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + t.proof_file} target="_blank" rel="noopener noreferrer" className="proof-link">
                            <FaExternalLinkAlt size={10} /> View Proof
                          </a>
                        )}
                      </td>
                      <td>{t.user_name || 'System / Admin'}</td>
                      <td className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                        {parseFloat(t.debit) > 0 ? `+${parseFloat(t.debit).toLocaleString()}` : '-'}
                      </td>
                      <td className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                        {parseFloat(t.credit) > 0 ? `-${parseFloat(t.credit).toLocaleString()}` : '-'}
                      </td>
                      <td className="amount-col" style={{ fontWeight: 800 }}>
                        {runningBalance.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>New Transaction</h2>
              <button onClick={() => setShowModal(false)} className="tab-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Transaction Type</label>
                <select name="type" className="form-control" value={formData.type} onChange={handleInputChange}>
                  <option value="add">Credit Balance</option>
                  <option value="deduct">Debit Balance</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (Rs.)</label>
                <input type="number" name="amount" className="form-control" required value={formData.amount} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Dealer (Optional)</label>
                <select name="user_id" className="form-control" value={formData.user_id} onChange={handleInputChange}>
                  <option value="">None / Admin</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Voucher Number</label>
                <input type="text" name="voucher_no" className="form-control" value={formData.voucher_no} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Instrument</label>
                <select name="instrument" className="form-control" value={formData.instrument} onChange={handleInputChange}>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online Transfer</option>
                </select>
              </div>
              {formData.instrument !== 'Cash' && (
                <div className="form-group">
                  <label>{formData.instrument} Number</label>
                  <input type="text" name="instrument_number" className="form-control" value={formData.instrument_number} onChange={handleInputChange} />
                </div>
              )}
              <div className="form-group">
                <label>Date</label>
                <input type="date" name="date" className="form-control" value={formData.date} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" className="form-control" value={formData.description} onChange={handleInputChange}></textarea>
              </div>
              <div className="form-group">
                <label>Proof File (Image)</label>
                <input type="file" className="form-control" accept="image/*" onChange={handleFileChange} />
              </div>
              <div className="modal-footer">
                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="add-btn">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Global Settings</h2>
              <button onClick={() => setShowSettings(false)} className="tab-btn"><FaTimes /></button>
            </div>
            <div className="form-group">
              <label>Adjustment Form Default Cost (Rs.)</label>
              <input
                type="number"
                className="form-control"
                value={adjustmentCost}
                onChange={(e) => setAdjustmentCost(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                This is the amount deducted from your Certificate balance when an adjustment is added to a deal.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="cancel-btn" onClick={() => setShowSettings(false)}>Cancel</button>
              <button type="button" className="add-btn" onClick={updateAdjustmentCost}>Update Setting</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageBalances;
