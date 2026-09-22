import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  FaChartBar, FaCalendarAlt, FaUserTie, FaWallet, FaHistory,
  FaPlus, FaTimes, FaExternalLinkAlt, FaFileInvoiceDollar, FaCheckCircle,
  FaEdit, FaTrash, FaFolderOpen
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { mergeFinanceEntries } from '../utils/financeLedger';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './Finance.css';

const FINANCE_LEDGER_COLUMNS = [
  { key: 'transaction_date', label: 'Date', type: 'date' },
  { key: 'user_name', label: 'Dealer', type: 'enum', accessor: (row) => row.user_name || 'System' },
  {
    key: 'reference',
    label: 'Reference',
    type: 'text',
    accessor: (row) => [...Array.from(row.vouchers || []), ...Array.from(row.instruments || [])].filter(Boolean).join(' '),
  },
  {
    key: 'description',
    label: 'Description',
    type: 'text',
    accessor: (row) => Array.from(row.descriptions || []).filter(Boolean).join(' '),
  },
  { key: 'credit', label: 'Credit', type: 'currency' },
  { key: 'debit', label: 'Debit', type: 'currency' },
  { key: 'runningBal', label: 'Balance', type: 'currency' },
];

const TEAM_PERFORMANCE_COLUMNS = [
  { key: 'dealer_name', label: 'Salesperson', type: 'text' },
  { key: 'total_revenue', label: 'Volume', type: 'currency' },
  { key: 'wallet_balance', label: 'Wallet', type: 'currency' },
];

const Finance = () => {
  const { user } = useAuth();
  const isAccountant = user?.role === 'accountant';
  const canManage = user?.role === 'admin' || user?.role === 'accountant';
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
  const [projects, setProjects] = useState([]);
  const [editEntry, setEditEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  const processedEntries = useMemo(() => mergeFinanceEntries(entries), [entries]);

  const {
    search: ledgerSearch, setSearch: setLedgerSearch,
    filters: ledgerFilters, setFilter: setLedgerFilter, clearFilters: clearLedgerFilters,
    filteredData: filteredLedgerEntries,
    uniqueValues: ledgerUniqueValues,
    showFilters: showLedgerFilters, setShowFilters: setShowLedgerFilters,
    activeFilterCount: ledgerActiveFilterCount,
  } = useTableFilters(processedEntries, FINANCE_LEDGER_COLUMNS);

  const {
    search: teamSearch, setSearch: setTeamSearch,
    filters: teamFilters, setFilter: setTeamFilter, clearFilters: clearTeamFilters,
    filteredData: filteredDealerStats,
    uniqueValues: teamUniqueValues,
    showFilters: showTeamFilters, setShowFilters: setShowTeamFilters,
    activeFilterCount: teamActiveFilterCount,
  } = useTableFilters(dealerStats, TEAM_PERFORMANCE_COLUMNS);

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
    project_id: '',
    balance_account_id: '',
    proof_file: null
  });

  useEffect(() => {
    fetchData();
    fetchProjects();
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

  const fetchProjects = async () => {
    try {
      const res = await api.get('/balance-projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Error fetching balance projects:', err);
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

  // The three Manage Balance accounts an entry can be transferred into.
  const balanceAccounts = [
    { id: 3, name: 'Dealer Advances' },
    { id: 8, name: 'Advance for Certificate' },
    { id: 4, name: 'Savings Deposits' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Only credit entries can be transferred, so clear the account if type flips to debit.
  const handleTypeChange = (e) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      type: value,
      balance_account_id: (value === 'add' || value === 'credit') ? prev.balance_account_id : ''
    }));
  };

  // Savings Deposits has no projects in Balance Management, so drop the project tag.
  const handleBalanceAccountChange = (e) => {
    const { value } = e.target;
    setFormData(prev => ({
      ...prev,
      balance_account_id: value,
      project_id: String(value) === '4' ? '' : prev.project_id
    }));
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, proof_file: e.target.files[0] });
  };

  const handleEditClick = (entry) => {
    const firstInstrument = Array.from(entry.instruments)[0] || '';
    const knownInstruments = ['Cash', 'Cheque', 'Online'];
    const parts = firstInstrument.split(' ');
    const instrumentType = knownInstruments.includes(parts[0]) ? parts[0] : 'Cash';
    const instrumentNumber = parts.length > 1 ? parts.slice(1).join(' ') : '';
    setEditEntry(entry);
    setEditFormData({
      date: new Date(entry.transaction_date).toISOString().split('T')[0],
      description: Array.from(entry.descriptions)[0] || '',
      voucher_no: Array.from(entry.vouchers)[0] || '',
      instrument: instrumentType,
      instrument_number: instrumentNumber,
      user_id: entry.user_id || '',
      line_id: entry.line_id || '',
      proof_file: null
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData({ ...editFormData, [name]: value });
  };

  const handleEditFileChange = (e) => {
    setEditFormData({ ...editFormData, proof_file: e.target.files[0] });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(editFormData).forEach(key => {
        if (editFormData[key] !== null && editFormData[key] !== undefined) {
          data.append(key, editFormData[key]);
        }
      });
      await api.put(`/balance-transactions/${editEntry.id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setEditEntry(null);
      fetchData();
    } catch (err) {
      alert('Error updating entry: ' + (err.response?.data?.message || err.message));
    }
  };

  /**
   * Delete a finance entry.
   *
   * entry.id is always the finance (credit) transaction — see the merge block in the
   * ledger table. Deleting it removes the finance transaction and its lines, which takes
   * the linked_line_id pointer with them: the linkage disappears from Manage Balances
   * while the balance entry itself survives.
   */
  const handleDelete = async (entry) => {
    const amt = parseFloat(entry.credit) || parseFloat(entry.debit) || 0;
    const isLinked = entry.linked_line_id !== null && entry.linked_line_id !== undefined;

    let msg;
    if (isLinked) {
      msg = `Delete this finance entry (Rs. ${amt.toLocaleString()})?\n\n`
          + `The linked Balance entry will NOT be deleted — it only loses its link to this entry.\n\n`
          + `Its offsetting Dealer Finance debit stays in place, so the wallet balance will drop `
          + `by Rs. ${amt.toLocaleString()}.\n\n`
          + `This cannot be undone.`;
    } else if (entry.is_merged) {
      msg = `This row combines two transactions.\n\n`
          + `Only the credit (finance entry) of Rs. ${amt.toLocaleString()} will be deleted. `
          + `The matching debit remains and will show as its own row.\n\n`
          + `This cannot be undone.`;
    } else {
      msg = 'Delete this transaction? This cannot be undone.';
    }

    if (!window.confirm(msg)) return;

    setDeletingId(entry.id);
    try {
      await api.delete(`/balance-transactions/${entry.id}`);
      fetchData();
    } catch (err) {
      alert('Error deleting entry: ' + (err.response?.data?.message || err.message));
    } finally {
      setDeletingId(null);
    }
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
        project_id: '',
        balance_account_id: '',
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
            <TableToolbar
              columns={FINANCE_LEDGER_COLUMNS}
              search={ledgerSearch}
              onSearchChange={setLedgerSearch}
              filters={ledgerFilters}
              onFilterChange={setLedgerFilter}
              uniqueValues={ledgerUniqueValues}
              showFilters={showLedgerFilters}
              onToggleFilters={() => setShowLedgerFilters(!showLedgerFilters)}
              onClearFilters={clearLedgerFilters}
              activeFilterCount={ledgerActiveFilterCount}
              searchPlaceholder="Search ledger by dealer, reference, description..."
              resultCount={filteredLedgerEntries.length}
            />
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
                    {canManage && <th style={{ textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    if (filteredLedgerEntries.length === 0) {
                      return <tr><td colSpan={6 + (isAccountant ? 1 : 0) + (canManage ? 1 : 0)} className="empty-state">No financial transactions found.</td></tr>;
                    }

                    return filteredLedgerEntries.map((entry, idx) => (
                      <tr key={`${entry.id}_${idx}`}>
                        <td data-label="Date">
                          {new Date(entry.transaction_date).toLocaleDateString()}
                          {entry.other_date && (
                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                              & {new Date(entry.other_date).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        {isAccountant && (
                          <td data-label="Dealer" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {entry.user_name || 'System'}
                          </td>
                        )}
                        <td data-label="Reference">
                          {Array.from(entry.vouchers).filter(Boolean).map((v, i) => (
                            <span key={i} className="voucher-badge" style={{ marginRight: '4px' }}>{v}</span>
                          ))}
                          {Array.from(entry.instruments).filter(Boolean).map((inst, i) => (
                            <div key={`inst_${i}`} className="instrument-tag" style={{ marginTop: '4px' }}>{inst}</div>
                          ))}
                        </td>
                        <td data-label="Description & Proof">
                          <div style={{ fontWeight: 600 }}>
                            {Array.from(entry.descriptions).map((desc, i) => (
                              <div key={`desc_${i}`} style={{ marginBottom: entry.descriptions.size > 1 ? '4px' : '0' }}>
                                {entry.descriptions.size > 1 ? `• ${desc}` : desc}
                              </div>
                            ))}
                          </div>
                          {entry.project_name && (
                            <div className="instrument-tag" style={{ marginTop: '4px', display: 'inline-block' }}>
                              <FaFolderOpen size={10} style={{ marginRight: '4px' }} />{entry.project_name}
                            </div>
                          )}
                          {entry.proof_files.map((file, i) => (
                            <div key={`proof_${i}`} style={{ marginTop: '4px' }}>
                              <a href={file.startsWith('http') ? file : (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + file} target="_blank" rel="noopener noreferrer" className="proof-link">
                                <FaExternalLinkAlt size={10} /> View Proof {entry.proof_files.length > 1 ? i + 1 : ''}
                              </a>
                            </div>
                          ))}
                        </td>
                        <td data-label="Credit (In)" className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                          {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                        </td>
                        <td data-label="Debit (Out)" className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                          {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                        </td>
                        <td data-label="Balance" className="amount-col" style={{ fontWeight: 800 }}>
                          {entry.runningBal.toLocaleString()}
                        </td>
                        {canManage && (
                          <td data-label="Actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => handleEditClick(entry)}
                              title="Edit Entry"
                              style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', marginRight: '6px' }}
                            >
                              <FaEdit size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(entry)}
                              title="Delete Entry"
                              disabled={deletingId === entry.id}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: '#dc3545', color: '#fff', cursor: 'pointer' }}
                            >
                              <FaTrash size={13} />
                            </button>
                          </td>
                        )}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '2rem' }}>
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
                            <td data-label="Period" style={{ fontWeight: '700' }}>{new Date(stat.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                            <td data-label="Revenue">Rs. {parseFloat(stat.revenue).toLocaleString()}</td>
                            <td data-label="Net Profit" style={{ color: 'var(--success)', fontWeight: '700' }}>Rs. {parseFloat(stat.profit).toLocaleString()}</td>
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
                  <TableToolbar
                    columns={TEAM_PERFORMANCE_COLUMNS}
                    search={teamSearch}
                    onSearchChange={setTeamSearch}
                    filters={teamFilters}
                    onFilterChange={setTeamFilter}
                    uniqueValues={teamUniqueValues}
                    showFilters={showTeamFilters}
                    onToggleFilters={() => setShowTeamFilters(!showTeamFilters)}
                    onClearFilters={clearTeamFilters}
                    activeFilterCount={teamActiveFilterCount}
                    searchPlaceholder="Search team by salesperson..."
                    resultCount={filteredDealerStats.length}
                  />
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
                        {filteredDealerStats.length === 0 ? (
                          <tr><td colSpan="3" className="empty-state">No team data available</td></tr>
                        ) : (
                          filteredDealerStats.map((stat, i) => (
                            <tr key={i}>
                              <td data-label="Salesperson" style={{ fontWeight: '700' }}>{stat.dealer_name}</td>
                              <td data-label="Volume">Rs. {parseFloat(stat.total_revenue).toLocaleString()}</td>
                              <td data-label="Wallet" style={{ color: 'var(--primary)', fontWeight: '700' }}>Rs. {parseFloat(stat.wallet_balance).toLocaleString()}</td>
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

      {/* Edit Entry Modal */}
      {editEntry && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Finance Entry</h2>
              <button onClick={() => setEditEntry(null)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              {canManage && (
                <div className="form-group">
                  <label>Salesperson</label>
                  <select name="user_id" className="form-control" value={editFormData.user_id} onChange={handleEditChange}>
                    <option value="">— Select Salesperson —</option>
                    {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Date</label>
                <input type="date" name="date" className="form-control" value={editFormData.date} onChange={handleEditChange} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" className="form-control" value={editFormData.description} onChange={handleEditChange}></textarea>
              </div>
              <div className="form-group">
                <label>Voucher Number</label>
                <input type="text" name="voucher_no" className="form-control" value={editFormData.voucher_no} onChange={handleEditChange} />
              </div>
              <div className="form-group">
                <label>Instrument</label>
                <select name="instrument" className="form-control" value={editFormData.instrument} onChange={handleEditChange}>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online Transfer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Instrument Number</label>
                <input type="text" name="instrument_number" className="form-control" value={editFormData.instrument_number} onChange={handleEditChange} />
              </div>
              <div className="form-group">
                <label>Replace Proof (optional)</label>
                <input type="file" className="form-control" accept="image/*" onChange={handleEditFileChange} />
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setEditEntry(null)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Update Entry</button>
              </div>
            </form>
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
                <select name="type" className="form-control" value={formData.type} onChange={handleTypeChange}>
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
              {(formData.type === 'add' || formData.type === 'credit') && (
                <div className="form-group">
                  <label>Transfer to Balance Account (Optional)</label>
                  <select
                    name="balance_account_id"
                    className="form-control"
                    value={formData.balance_account_id}
                    onChange={handleBalanceAccountChange}
                  >
                    <option value="">— None (keep in wallet) —</option>
                    {balanceAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <small style={{ color: 'var(--text-muted)' }}>
                    Pick an account to also create the matching Balance entry and link the two
                    immediately. Leave as None to keep the money in the wallet and link it later
                    from Balance Management.
                  </small>
                </div>
              )}
              <div className="form-group">
                <label>
                  {formData.balance_account_id ? 'Balance Project' : 'Tag with Balance Project'} (Optional)
                </label>
                <select
                  name="project_id"
                  className="form-control"
                  value={formData.project_id}
                  onChange={handleInputChange}
                  disabled={String(formData.balance_account_id) === '4'}
                >
                  <option value="">— None / General —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <small style={{ color: 'var(--text-muted)' }}>
                  {String(formData.balance_account_id) === '4'
                    ? 'Savings Deposits are not organised into projects.'
                    : projects.length === 0
                      ? 'No balance projects exist yet — create one in Balance Management.'
                      : formData.balance_account_id
                        ? 'The new Balance entry will be filed under this project.'
                        : 'Tags this entry with a project. Leave as None to keep the current flow.'}
                </small>
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
