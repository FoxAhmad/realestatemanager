import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  FaChartBar, FaCalendarAlt, FaUserTie, FaWallet, FaHistory,
  FaPlus, FaTimes, FaExternalLinkAlt, FaFileInvoiceDollar, FaCheckCircle
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './Finance.css';

const Finance = () => {
  const { user } = useAuth();
  const isAccountant = user?.role === 'accountant';
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' or 'analytics'
  const [summary, setSummary] = useState({
    total_revenue: 0,
    total_profit: 0,
    dealer_finance_balance: 0,
    completed_deals: 0,
    active_deals: 0
  });
  const [entries, setEntries] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [dealerStats, setDealerStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [dealers, setDealers] = useState([]);

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

  useEffect(() => {
    fetchData();
    if (user.role === 'admin' || user.role === 'accountant') {
      fetchDealers();
      fetchDealerStats();
    }
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [summaryRes, entriesRes, monthlyRes] = await Promise.all([
        api.get('/finance/summary'),
        api.get('/finance/entries'),
        api.get('/finance/monthly')
      ]);
      setSummary(summaryRes.data);
      setEntries(entriesRes.data);
      setMonthlyStats(monthlyRes.data);
    } catch (error) {
      console.error('Error fetching finance data:', error);
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

  const fetchDealerStats = async () => {
    try {
      const res = await api.get('/finance/by-dealer');
      setDealerStats(res.data);
    } catch (err) {
      console.error('Error fetching dealer stats:', err);
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
        if (formData[key] !== null) data.append(key, formData[key]);
      });

      await api.post('/finance/entries', data, {
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
      alert('Error creating entry: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return <div className="finance-loading">Reconciling Financial Records...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Finance & Earnings</h1>
          <p>Track your profits, manage your wallet, and view performance analytics.</p>
        </div>
        <div className="header-actions">
          <button className="premium-btn premium-btn-primary" onClick={() => setShowModal(true)}>
            <FaPlus /> Add Entry
          </button>
        </div>
      </div>

      <div className="finance-tabs-nav">
        <button
          className={`tab-item ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <FaWallet /> {isAccountant ? 'Network Ledger' : 'My Wallet & Ledger'}
        </button>
        <button
          className={`tab-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <FaChartBar /> Performance Analytics
        </button>
      </div>

      <div className="finance-summary-grid">
        <div className="summary-card glass-card wallet-card">
          <div className="card-top">
            <label>{isAccountant ? 'Total Dealer Wallets' : 'Wallet Balance'}</label>
            <FaWallet className="card-icon" />
          </div>
          <span className="amount profit">Rs. {parseFloat(summary.dealer_finance_balance || 0).toLocaleString()}</span>
          <p className="card-subtext">Available for withdrawal / use</p>
        </div>
        <div className="summary-card glass-card">
          <div className="card-top">
            <label>{isAccountant ? 'Network Profits' : 'Total Profit Earned'}</label>
            <FaFileInvoiceDollar className="card-icon" />
          </div>
          <span className="amount">Rs. {parseFloat(summary.total_profit || 0).toLocaleString()}</span>
          <p className="card-subtext">Cumulative earnings from deals</p>
        </div>
        <div className="summary-card glass-card">
          <div className="card-top">
            <label>Completed Deals</label>
            <FaCheckCircle className="card-icon" />
          </div>
          <span className="amount" style={{ color: 'var(--primary)' }}>{summary.completed_deals}</span>
          <p className="card-subtext">{summary.active_deals} deals currently in progress</p>
        </div>
      </div>

      {activeTab === 'ledger' ? (
        <section className="finance-ledger-section animate-fade-in">
          <div className="section-header">
            <h2><FaHistory /> Transaction History</h2>
          </div>
          <div className="glass-card" style={{ padding: '0' }}>
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {isAccountant && <th>Dealer</th>}
                    <th>Reference</th>
                    <th>Description & Proof</th>
                    <th className="amount-col">Credit (In)</th>
                    <th className="amount-col">Debit (Out)</th>
                    <th className="amount-col">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (entries.length === 0) {
                      return <tr><td colSpan={isAccountant ? 7 : 6} className="empty-state">No financial transactions found.</td></tr>;
                    }

                    const processedEntries = [];
                    const usedIndices = new Set();

                    entries.forEach((entry, idx) => {
                      if (usedIndices.has(idx)) return;

                      const isCredit = parseFloat(entry.credit) > 0;
                      const isDebit = parseFloat(entry.debit) > 0;
                      const amount = isCredit ? parseFloat(entry.credit) : parseFloat(entry.debit);
                      
                      let matchIdx = -1;
                      if (amount > 0) {
                        for (let j = idx + 1; j < entries.length; j++) {
                          if (usedIndices.has(j)) continue;
                          const other = entries[j];
                          const otherDealer = other.user_name || 'System';
                          const thisDealer = entry.user_name || 'System';
                          
                          if (otherDealer === thisDealer) {
                            const otherCredit = parseFloat(other.credit) || 0;
                            const otherDebit = parseFloat(other.debit) || 0;
                            
                            if (isCredit && otherDebit === amount) {
                              matchIdx = j;
                              break;
                            }
                            if (isDebit && otherCredit === amount) {
                              matchIdx = j;
                              break;
                            }
                          }
                        }
                      }

                      if (matchIdx !== -1) {
                        usedIndices.add(idx);
                        usedIndices.add(matchIdx);
                        const matchEntry = entries[matchIdx];
                        
                        processedEntries.push({
                          ...entry,
                          credit: amount,
                          debit: amount,
                          descriptions: new Set([entry.description, matchEntry.description].filter(Boolean)),
                          proof_files: [entry.proof_file, matchEntry.proof_file].filter(Boolean),
                          instruments: new Set([
                            `${entry.instrument || ''} ${entry.instrument_number || ''}`.trim(),
                            `${matchEntry.instrument || ''} ${matchEntry.instrument_number || ''}`.trim()
                          ].filter(Boolean)),
                          vouchers: new Set([entry.voucher_no, matchEntry.voucher_no].filter(Boolean)),
                          transaction_date: entry.transaction_date,
                          other_date: new Date(matchEntry.transaction_date).toLocaleDateString() !== new Date(entry.transaction_date).toLocaleDateString() 
                            ? matchEntry.transaction_date 
                            : null
                        });
                      } else {
                        usedIndices.add(idx);
                        processedEntries.push({
                          ...entry,
                          credit: parseFloat(entry.credit) || 0,
                          debit: parseFloat(entry.debit) || 0,
                          descriptions: new Set(entry.description ? [entry.description] : []),
                          proof_files: entry.proof_file ? [entry.proof_file] : [],
                          instruments: new Set([`${entry.instrument || ''} ${entry.instrument_number || ''}`.trim()].filter(Boolean)),
                          vouchers: new Set(entry.voucher_no ? [entry.voucher_no] : [])
                        });
                      }
                    });

                    let currentBalance = 0;
                    for (let i = processedEntries.length - 1; i >= 0; i--) {
                      currentBalance += (processedEntries[i].credit - processedEntries[i].debit);
                      processedEntries[i].runningBal = currentBalance;
                    }

                    return processedEntries.map((entry, idx) => (
                      <tr key={`${entry.id}_${idx}`}>
                        <td>
                          {new Date(entry.transaction_date).toLocaleDateString()}
                          {entry.other_date && (
                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                              & {new Date(entry.other_date).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        {isAccountant && (
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {entry.user_name || 'System'}
                          </td>
                        )}
                        <td>
                          {Array.from(entry.vouchers).filter(Boolean).map((v, i) => (
                            <span key={i} className="voucher-badge" style={{ marginRight: '4px' }}>{v}</span>
                          ))}
                          {Array.from(entry.instruments).filter(Boolean).map((inst, i) => (
                            <div key={`inst_${i}`} className="instrument-tag" style={{ marginTop: '4px' }}>{inst}</div>
                          ))}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {Array.from(entry.descriptions).map((desc, i) => (
                              <div key={`desc_${i}`} style={{ marginBottom: entry.descriptions.size > 1 ? '4px' : '0' }}>
                                {entry.descriptions.size > 1 ? `• ${desc}` : desc}
                              </div>
                            ))}
                          </div>
                          {entry.proof_files.map((file, i) => (
                            <div key={`proof_${i}`} style={{ marginTop: '4px' }}>
                              <a href={file.startsWith('http') ? file : (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + file} target="_blank" rel="noopener noreferrer" className="proof-link">
                                <FaExternalLinkAlt size={10} /> View Proof {entry.proof_files.length > 1 ? i + 1 : ''}
                              </a>
                            </div>
                          ))}
                        </td>
                        <td className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                          {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                        </td>
                        <td className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                          {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                        </td>
                        <td className="amount-col" style={{ fontWeight: 800 }}>
                          {entry.runningBal.toLocaleString()}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <div className="analytics-container animate-fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <section className="finance-section">
              <h2><FaCalendarAlt style={{ color: 'var(--primary)' }} /> Monthly Performance</h2>
              <div className="glass-card" style={{ padding: '0' }}>
                <div className="premium-table-container">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Revenue</th>
                        <th>Net Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyStats.length === 0 ? (
                        <tr><td colSpan="3" className="empty-state">No monthly data available</td></tr>
                      ) : (
                        monthlyStats.map((stat, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: '700' }}>{new Date(stat.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                            <td>Rs. {parseFloat(stat.revenue).toLocaleString()}</td>
                            <td style={{ color: 'var(--success)', fontWeight: '700' }}>Rs. {parseFloat(stat.profit).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {user.role !== 'dealer' && (
              <section className="finance-section">
                <h2><FaUserTie style={{ color: 'var(--primary)' }} /> Team Performance</h2>
                <div className="glass-card" style={{ padding: '0' }}>
                  <div className="premium-table-container">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Salesperson</th>
                          <th>Volume</th>
                          <th>Wallet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealerStats.length === 0 ? (
                          <tr><td colSpan="3" className="empty-state">No team data available</td></tr>
                        ) : (
                          dealerStats.map((stat, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: '700' }}>{stat.dealer_name}</td>
                              <td>Rs. {parseFloat(stat.total_revenue).toLocaleString()}</td>
                              <td style={{ color: 'var(--primary)', fontWeight: '700' }}>Rs. {parseFloat(stat.wallet_balance).toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* Add Entry Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>New Finance Entry</h2>
              <button onClick={() => setShowModal(false)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Entry Type</label>
                <select name="type" className="form-control" value={formData.type} onChange={handleInputChange}>
                  <option value="add">Credit (Income/Deposit)</option>
                  <option value="deduct">Debit (Withdraw/Use)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (Rs.)</label>
                <input type="number" name="amount" className="form-control" required value={formData.amount} onChange={handleInputChange} />
              </div>
              {(user.role === 'admin' || user.role === 'accountant') && (
                <div className="form-group">
                  <label>Apply to Dealer</label>
                  <select name="user_id" className="form-control" value={formData.user_id} onChange={handleInputChange}>
                    <option value={user.id}>Myself</option>
                    {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
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
                <label>Description / Source</label>
                <textarea name="description" className="form-control" placeholder="Where did you get this money from?" value={formData.description} onChange={handleInputChange}></textarea>
              </div>
              <div className="form-group">
                <label>Proof Attachment (Slip/Receipt)</label>
                <input type="file" className="form-control" accept="image/*" onChange={handleFileChange} />
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;
