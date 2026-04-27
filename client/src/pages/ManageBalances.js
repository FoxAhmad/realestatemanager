import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FaPlus, FaSearch, FaHistory, FaCog, FaFileUpload,
  FaWallet, FaCertificate, FaPiggyBank, FaTimes, FaExternalLinkAlt,
  FaChevronDown, FaChevronUp, FaCheckCircle
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
  const [expandedRows, setExpandedRows] = useState({});

  // Finance Entry State
  const [availableFinanceEntries, setAvailableFinanceEntries] = useState([]);
  const [selectedFinanceEntries, setSelectedFinanceEntries] = useState([]);

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

  useEffect(() => {
    if (formData.user_id && showModal) {
        fetchAvailableFinance(formData.user_id);
    } else {
        setAvailableFinanceEntries([]);
        setSelectedFinanceEntries([]);
    }
  }, [formData.user_id, showModal]);

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

  const fetchAvailableFinance = async (userId) => {
      try {
          const res = await api.get(`/finance/entries?userId=${userId}&unlinkedOnly=true`);
          setAvailableFinanceEntries(res.data);
      } catch (err) {
          console.error('Error fetching finance entries:', err);
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

  const toggleFinanceEntry = (entry) => {
      let newSelected;
      if (selectedFinanceEntries.find(e => e.line_id === entry.line_id)) {
          newSelected = selectedFinanceEntries.filter(e => e.line_id !== entry.line_id);
      } else {
          newSelected = [...selectedFinanceEntries, entry];
      }
      setSelectedFinanceEntries(newSelected);
      
      // Auto-update amount
      const total = newSelected.reduce((sum, e) => sum + parseFloat(e.credit), 0);
      if (total > 0) {
        setFormData(prev => ({ ...prev, amount: total.toString(), description: `Transfer from Finance: ${newSelected.map(e => e.description).join(', ')}` }));
      }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null) data.append(key, formData[key]);
      });
      data.append('account_id', activeTab);
      
      if (selectedFinanceEntries.length > 0) {
          data.append('linked_finance_line_ids', JSON.stringify(selectedFinanceEntries.map(e => e.line_id)));
      }

      await api.post('/balance-transactions', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      alert('Error creating transaction: ' + (err.response?.data?.message || err.message));
    }
  };

  const resetForm = () => {
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
      setSelectedFinanceEntries([]);
  }

  const toggleRow = (id) => {
      setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
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
          <button className="premium-btn premium-btn-secondary" onClick={() => setShowSettings(true)}>
            <FaCog /> Settings
          </button>
          <button className="premium-btn premium-btn-primary" onClick={() => setShowModal(true)}>
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
            <div className="amount">Rs. {Math.abs(totalBalance).toLocaleString()}</div>
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
                <th style={{ width: '40px' }}></th>
                <th>Date</th>
                <th>Voucher #</th>
                <th>Narration & Proof</th>
                <th>Dealer / Ref</th>
                <th className="amount-col">Debit</th>
                <th className="amount-col">Credit</th>
                <th className="amount-col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="empty-state">Loading transactions...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No transactions recorded for this account</td></tr>
              ) : (
                transactions.map((t, idx) => {
                  const runningBalance = transactions.slice(idx).reduce((sum, item) => {
                    return sum + (parseFloat(item.debit) - parseFloat(item.credit));
                  }, 0);
                  const isExpanded = expandedRows[t.id];
                  const hasLinked = t.linked_entries && t.linked_entries.length > 0;

                  return (
                    <React.Fragment key={t.id}>
                        <tr>
                            <td>
                                {hasLinked && (
                                    <button className="expand-btn" onClick={() => toggleRow(t.id)}>
                                        {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                                    </button>
                                )}
                            </td>
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
                            <td>
                                {(() => {
                                    const names = new Set();
                                    if (t.user_name) names.add(t.user_name);
                                    if (t.linked_entries) {
                                        t.linked_entries.forEach(e => {
                                            if (e.user_name) names.add(e.user_name);
                                        });
                                    }
                                    return Array.from(names).join(', ') || 'System / Admin';
                                })()}
                            </td>
                            <td className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                                {parseFloat(t.debit) > 0 ? parseFloat(t.debit).toLocaleString() : '-'}
                            </td>
                            <td className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                                {parseFloat(t.credit) > 0 ? parseFloat(t.credit).toLocaleString() : '-'}
                            </td>
                            <td className="amount-col" style={{ fontWeight: 800 }}>
                                {Math.abs(runningBalance).toLocaleString()}
                            </td>
                        </tr>
                        {isExpanded && hasLinked && (
                            <tr className="expanded-details-row">
                                <td colSpan="8">
                                    <div className="linked-entries-detail">
                                        <h4><FaCheckCircle color="var(--success)" /> Linked Finance Entries</h4>
                                        <div className="linked-grid">
                                            {t.linked_entries.map(entry => (
                                                <div key={entry.id} className="linked-item-card">
                                                    <div className="linked-item-header">
                                                        <span className="date">{new Date(entry.date).toLocaleDateString()}</span>
                                                        <span className="dealer-badge">{entry.user_name}</span>
                                                    </div>
                                                    <div className="linked-item-body">
                                                        <span className="amount">Rs. {parseFloat(entry.amount).toLocaleString()}</span>
                                                        <p>{entry.description}</p>
                                                    </div>
                                                    {entry.proof_file && (
                                                        <a href={(process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + entry.proof_file} target="_blank" rel="noopener noreferrer" className="proof-link small">
                                                            View Orig. Proof
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
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
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h2>New Balance Entry</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-two-col">
              <div className="form-main">
                <div className="form-group">
                    <label>Dealer</label>
                    <select name="user_id" className="form-control" required value={formData.user_id} onChange={handleInputChange}>
                    <option value="">Select a Dealer</option>
                    {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label>Transaction Type</label>
                    <select name="type" className="form-control" value={formData.type} onChange={handleInputChange}>
                    <option value="add">Credit (Increase Balance)</option>
                    <option value="deduct">Debit (Decrease Balance)</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Amount (Rs.)</label>
                    <input type="number" name="amount" className="form-control" required value={formData.amount} onChange={handleInputChange} />
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
              </div>

              <div className="form-sidebar">
                  <div className="finance-selection-box">
                      <h3>Available Finance Entries</h3>
                      <p className="subtext">Select entries to transfer from dealer's wallet</p>
                      
                      {!formData.user_id ? (
                          <div className="empty-selection">Select a dealer to see available profits</div>
                      ) : availableFinanceEntries.length === 0 ? (
                          <div className="empty-selection">No unlinked finance entries for this dealer</div>
                      ) : (
                          <div className="finance-entries-list">
                              {availableFinanceEntries.map(entry => {
                                  const isSelected = selectedFinanceEntries.find(e => e.line_id === entry.line_id);
                                  return (
                                      <div 
                                        key={entry.line_id} 
                                        className={`finance-entry-item ${isSelected ? 'selected' : ''}`}
                                        onClick={() => toggleFinanceEntry(entry)}
                                      >
                                          <div className="entry-check">
                                              <div className={`checkbox ${isSelected ? 'checked' : ''}`}></div>
                                          </div>
                                          <div className="entry-info">
                                              <div className="entry-title">{entry.description}</div>
                                              <div className="entry-meta">
                                                  <span>{new Date(entry.transaction_date).toLocaleDateString()}</span>
                                                  <span className="entry-amount">Rs. {parseFloat(entry.credit).toLocaleString()}</span>
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                      
                      {selectedFinanceEntries.length > 0 && (
                          <div className="selection-summary">
                              <div>Selected: <strong>{selectedFinanceEntries.length}</strong></div>
                              <div>Total: <strong>Rs. {parseFloat(formData.amount).toLocaleString()}</strong></div>
                          </div>
                      )}
                  </div>
              </div>

              <div className="modal-footer full-width">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save & Link Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal ... same as before */}
    </div>
  );
};

export default ManageBalances;
