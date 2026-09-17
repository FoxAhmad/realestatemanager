import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import {
  FaPlus, FaSearch, FaHistory, FaFilePdf,
  FaWallet, FaPiggyBank, FaTimes, FaExternalLinkAlt,
  FaChevronDown, FaChevronUp, FaCheckCircle, FaUser, FaMapMarkerAlt,
  FaEdit, FaArrowLeft, FaFolder, FaFolderOpen, FaTrash, FaEye,
  FaBuilding, FaExchangeAlt, FaUsers, FaListAlt
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import {
  buildDealerLedgers, buildDealerSharesPDF, buildTotalSummaryPDF
} from '../utils/balanceReports';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './ManageBalances.css';

const dealerRefAccessor = (row) => {
  const names = new Set();
  if (row.customer_name) names.add(row.customer_name + ' (Client)');
  else if (row.user_name) names.add(row.user_name);
  if (row.linked_entries) {
    row.linked_entries.forEach(e => {
      if (e.customer_name) names.add(e.customer_name + ' (Client)');
      else if (e.user_name) names.add(e.user_name);
    });
  }
  return Array.from(names).join(', ') || 'System / Admin';
};

const BALANCE_COLUMNS = [
  { key: 'transaction_date', label: 'Date', type: 'date' },
  { key: 'voucher_no', label: 'Voucher #', type: 'text' },
  { key: 'description', label: 'Narration', type: 'text' },
  { key: 'dealer_ref', label: 'Dealer / Ref', type: 'text', accessor: dealerRefAccessor },
  { key: 'debit', label: 'Debit', type: 'currency' },
  { key: 'credit', label: 'Credit', type: 'currency' },
  { key: 'running_balance', label: 'Balance', type: 'currency', accessor: (row) => row._runningBalance },
];

const ManageBalances = () => {
  const { user } = useAuth();
  const isAdminOrAccountant = user && (user.role === 'admin' || user.role === 'accountant');

  // ── View State ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(3); // 3=Dealer Advances, 4=Savings, 8=Certificate
  const [view, setView] = useState('projects'); // 'projects' | 'entries'
  const [selectedProject, setSelectedProject] = useState(null); // null | { id, name, ... }

  // ── Data State ───────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // null = new, obj = edit
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [expandedRows, setExpandedRows] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  // ── Move to Project State ───────────────────────────────────────────────────
  const [moveTarget, setMoveTarget] = useState(null); // { lineId, currentDesc } | null
  const [moveProjectId, setMoveProjectId] = useState('');

  // ── Edit Transaction Modal ───────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState({
    id: '', date: '', description: '', voucher_no: '',
    instrument: 'Cash', instrument_number: '', proof_file: null
  });

  // ── Finance Entries State ────────────────────────────────────────────────────
  const [availableFinanceEntries, setAvailableFinanceEntries] = useState([]);
  const [selectedFinanceEntries, setSelectedFinanceEntries] = useState([]);

  // ── Transaction Form State ───────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    amount: '', type: 'add',
    date: new Date().toISOString().split('T')[0],
    description: '', voucher_no: '', instrument: 'Cash',
    instrument_number: '', user_id: '', proof_file: null
  });

  const accounts = [
    { id: 3, name: 'Dealer Advances', icon: <FaWallet />, color: '#007bff' },
    { id: 4, name: 'Savings Deposits', icon: <FaPiggyBank />, color: '#28a745' }
  ];

  // ── Fetch Helpers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDealers();
  }, []);

  useEffect(() => {
    // When switching tabs, if Account 4 (savings) has no projects, go straight to entries
    if (activeTab === 4) {
      setView('entries');
      setSelectedProject(null);
      fetchTransactions(null);
    } else {
      setView('projects');
      setSelectedProject(null);
      fetchProjects();
    }
  }, [activeTab]);

  // Close the export menu on any outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const onDocClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showExportMenu]);

  useEffect(() => {
    if (formData.user_id && showModal) {
      fetchAvailableFinance(formData.user_id);
    } else {
      setAvailableFinanceEntries([]);
      setSelectedFinanceEntries([]);
    }
  }, [formData.user_id, showModal]);

  useEffect(() => {
    if (formData.type === 'deduct' && selectedFinanceEntries.length > 0) {
      setSelectedFinanceEntries([]);
      setFormData(prev => ({ ...prev, amount: '', description: '' }));
    }
  }, [formData.type]);

  const fetchProjects = async () => {
    try {
      setProjectsLoading(true);
      const res = await api.get('/balance-projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const fetchTransactions = async (projectId) => {
    try {
      setLoading(true);
      // projectId null = unassigned, undefined = no filter (savings), otherwise numeric
      let url = `/balance-transactions/${activeTab}`;
      if (activeTab !== 4) {
        const pid = projectId === null ? 'unassigned' : projectId;
        url += `?project_id=${pid}`;
      }
      const res = await api.get(url);
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
    } catch (err) { console.error('Error fetching dealers:', err); }
  };

  const fetchAvailableFinance = async (userId) => {
    try {
      const res = await api.get(`/finance/entries?userId=${userId}&unlinkedOnly=true`);
      setAvailableFinanceEntries(res.data);
    } catch (err) { console.error('Error fetching finance entries:', err); }
  };

  // ── Project Actions ───────────────────────────────────────────────────────────
  const openProject = (project) => {
    setSelectedProject(project);
    setView('entries');
    fetchTransactions(project ? project.id : null);
  };

  const backToProjects = () => {
    setView('projects');
    setSelectedProject(null);
    setTransactions([]);
    fetchProjects();
  };

  const openNewProjectModal = () => {
    setEditingProject(null);
    setProjectForm({ name: '', description: '' });
    setShowProjectModal(true);
  };

  const openEditProjectModal = (proj) => {
    setEditingProject(proj);
    setProjectForm({ name: proj.name, description: proj.description || '' });
    setShowProjectModal(true);
  };

  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await api.put(`/balance-projects/${editingProject.id}`, projectForm);
      } else {
        await api.post('/balance-projects', projectForm);
      }
      setShowProjectModal(false);
      fetchProjects();
    } catch (err) {
      alert('Error saving project: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteProject = async (proj) => {
    if (!window.confirm(`Delete project "${proj.name}"? This only works if the project has no entries.`)) return;
    try {
      await api.delete(`/balance-projects/${proj.id}`);
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.message || 'Error deleting project');
    }
  };

  // ── Transaction Actions ───────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, proof_file: e.target.files[0] });
  };

  const toggleFinanceEntry = (entry) => {
    if (formData.type === 'deduct') return;
    let newSelected;
    if (selectedFinanceEntries.find(e => e.line_id === entry.line_id)) {
      newSelected = selectedFinanceEntries.filter(e => e.line_id !== entry.line_id);
    } else {
      newSelected = [...selectedFinanceEntries, entry];
    }
    setSelectedFinanceEntries(newSelected);
    const total = newSelected.reduce((sum, e) => sum + parseFloat(e.credit), 0);
    if (total > 0) {
      setFormData(prev => ({
        ...prev, amount: total.toString(),
        description: `Transfer from Finance: ${newSelected.map(e => e.description).join(', ')}`
      }));
    } else {
      setFormData(prev => ({ ...prev, amount: '', description: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null) {
          if (key === 'date' && formData[key] === new Date().toISOString().split('T')[0]) {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0];
            data.append(key, `${formData[key]}T${timeStr}`);
          } else {
            data.append(key, formData[key]);
          }
        }
      });
      data.append('account_id', activeTab);

      // Tag with the current project
      if (selectedProject) {
        data.append('project_id', selectedProject.id);
      }

      if (selectedFinanceEntries.length > 0) {
        data.append('linked_finance_line_ids', JSON.stringify(selectedFinanceEntries.map(e => e.line_id)));
      }

      await api.post('/balance-transactions', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowModal(false);
      resetForm();
      fetchTransactions(selectedProject ? selectedProject.id : null);
      // Also refresh project summaries in background
      if (view === 'entries') fetchProjects();
    } catch (err) {
      alert('Error creating transaction: ' + (err.response?.data?.message || err.message));
    }
  };

  const resetForm = () => {
    setFormData({
      instrument: 'Cash', instrument_number: '', user_id: '',
      proof_file: null,
      amount: '', type: 'add', date: new Date().toISOString().split('T')[0],
      description: '', voucher_no: ''
    });
    setSelectedFinanceEntries([]);
  };

  const handleEditClick = (transaction) => {
    setEditData({
      id: transaction.id,
      date: transaction.transaction_date ? new Date(transaction.transaction_date).toISOString().split('T')[0] : '',
      description: transaction.description || '',
      voucher_no: transaction.voucher_no || '',
      instrument: transaction.instrument || 'Cash',
      instrument_number: transaction.instrument_number || '',
      proof_file: null
    });
    setShowEditModal(true);
  };

  /**
   * Delete a balance entry. Linked finance entries are deliberately preserved —
   * they stay in Finance and go back to the unlinked pool so they can be re-linked.
   */
  const handleDeleteTransaction = async (t) => {
    const linkedCount = t.linked_entries ? t.linked_entries.length : 0;
    const confirmMsg = linkedCount > 0
      ? `Delete this balance entry?\n\n`
        + `${linkedCount} linked finance ${linkedCount === 1 ? 'entry' : 'entries'} will NOT be deleted. `
        + `${linkedCount === 1 ? 'It' : 'They'} will stay in Finance and return to the unlinked pool, ready to be linked again.\n\n`
        + `This cannot be undone.`
      : 'Delete this balance entry? This cannot be undone.';

    if (!window.confirm(confirmMsg)) return;

    setDeletingId(t.id);
    try {
      const res = await api.delete(`/balance-transactions/${t.id}`);
      const n = res.data?.unlinked_finance_entries || 0;
      if (n > 0) {
        alert(`Balance entry deleted. ${n} finance ${n === 1 ? 'entry was' : 'entries were'} preserved and returned to the unlinked pool.`);
      }
      fetchTransactions(selectedProject ? selectedProject.id : null);
      fetchProjects();
    } catch (err) {
      alert('Error deleting entry: ' + (err.response?.data?.message || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenMoveModal = (t) => {
    setMoveTarget({ lineId: t.line_id, desc: t.description || '(no description)' });
    setMoveProjectId('');
  };

  const handleMoveToProject = async (e) => {
    e.preventDefault();
    if (!moveProjectId) return;
    try {
      await api.patch(`/balance-transactions/line/${moveTarget.lineId}/project`, {
        project_id: parseInt(moveProjectId)
      });
      setMoveTarget(null);
      // Refresh: remove this entry from the General list
      fetchTransactions(null);
      fetchProjects();
    } catch (err) {
      alert('Error moving entry: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(editData).forEach(key => {
        if (editData[key] !== null && key !== 'id') {
          data.append(key, editData[key]);
        }
      });
      await api.put(`/balance-transactions/${editData.id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowEditModal(false);
      fetchTransactions(selectedProject ? selectedProject.id : null);
    } catch (err) {
      alert('Error updating transaction: ' + (err.response?.data?.message || err.message));
    }
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Running balance depends on each row's position in the FULL unfiltered ledger
  // (sum of this row and everything after it), so it must be computed once here,
  // before any search/filter is applied — filtering must never re-sort or
  // re-derive this ledger math.
  const transactionsWithBalance = useMemo(() => {
    return transactions.map((t, idx) => ({
      ...t,
      _runningBalance: transactions.slice(idx).reduce((sum, item) => {
        return sum + (parseFloat(item.credit) - parseFloat(item.debit));
      }, 0),
      _balanceChange: parseFloat(t.credit) - parseFloat(t.debit),
    }));
  }, [transactions]);

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredTransactions,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(transactionsWithBalance, BALANCE_COLUMNS);

  // ── Computed Values ───────────────────────────────────────────────────────────
  const totalBalance = transactions.reduce((sum, t) => {
    return sum + (parseFloat(t.credit) - parseFloat(t.debit));
  }, 0);

  // Shared with the PDF exports so printed shares can never drift from the cards.
  const dealerBalances = buildDealerLedgers({
    transactions, entities: dealers, activeTab
  });

  // ── PDF Exports ───────────────────────────────────────────────────────────────
  const reportArgs = () => ({
    transactions,
    ledgers: dealerBalances,
    activeTab,
    accountName: accounts.find(a => a.id === activeTab)?.name || 'Account',
    projectName: selectedProject ? selectedProject.name : null,
    preparedBy: user?.name || user?.email || '—',
    totalBalance,
    totalQuantity: null
  });

  const runExport = (builder) => {
    setShowExportMenu(false);
    try {
      builder(reportArgs());
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Could not generate the PDF: ' + err.message);
    }
  };

  // ── Render: Project Card ──────────────────────────────────────────────────────
  const renderProjectCard = (proj, isGeneral = false) => {
    // Only account 3 (Dealer Advances) uses the projects view, so balance/count
    // always come from the advances-specific aggregates.
    const balance = isGeneral ? null : parseFloat(proj.advances_balance || 0);
    const entries = isGeneral ? '—' : parseInt(proj.advances_count || 0);

    return (
      <div
        key={isGeneral ? 'general' : proj.id}
        className={`project-card glass-card ${isGeneral ? 'project-card-general' : ''}`}
      >
        <div className="project-card-icon">
          {isGeneral ? <FaFolder /> : <FaFolderOpen />}
        </div>
        <div className="project-card-body">
          <div className="project-card-name">{isGeneral ? 'General / Unassigned' : proj.name}</div>
          {!isGeneral && proj.description && (
            <div className="project-card-desc">{proj.description}</div>
          )}
          {isGeneral && (
            <div className="project-card-desc">Legacy entries with no assigned project</div>
          )}
          <div className="project-card-stats">
            <div className="project-stat">
              <span className="stat-label">Balance</span>
              <span className={`stat-val ${isGeneral ? '' : (balance >= 0 ? 'text-success' : 'text-danger')}`}>
                {isGeneral ? '—' : `Rs. ${balance.toLocaleString()}`}
              </span>
            </div>
            <div className="project-stat">
              <span className="stat-label">Entries</span>
              <span className="stat-val">{entries}</span>
            </div>
          </div>
        </div>
        <div className="project-card-actions">
          <button
            className="project-view-btn"
            onClick={() => openProject(isGeneral ? null : proj)}
          >
            <FaEye /> View Entries
          </button>
          {!isGeneral && isAdminOrAccountant && (
            <div className="project-edit-actions">
              <button className="project-icon-btn edit" onClick={() => openEditProjectModal(proj)} title="Edit project">
                <FaEdit />
              </button>
              <button className="project-icon-btn delete" onClick={() => handleDeleteProject(proj)} title="Delete project">
                <FaTrash />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────────
  return (
    <div className="premium-page manage-balances-container">
      {/* Page Header */}
      <div className="premium-page-header">
        <div>
          <h1>Balance Management</h1>
          <p>Manage Asset accounts with Union Town and track transaction proofs.</p>
        </div>
        <div className="header-actions">
          {view === 'entries' && (
            <div className="export-menu-wrap" ref={exportMenuRef}>
              <button
                className="premium-btn premium-btn-secondary"
                onClick={() => setShowExportMenu(v => !v)}
                aria-haspopup="true"
                aria-expanded={showExportMenu}
              >
                <FaFilePdf /> Export PDF {showExportMenu ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button className="export-menu-item" onClick={() => runExport(buildDealerSharesPDF)}>
                    <span className="export-menu-icon"><FaUsers /></span>
                    <span className="export-menu-text">
                      <strong>Dealer Shares &amp; Payment Logs</strong>
                      <small>
                        Every included dealer's share, each followed by the payment logs behind it
                        {dealerBalances.length > 0 && ` · ${dealerBalances.length} ${dealerBalances.length === 1 ? 'party' : 'parties'}`}
                      </small>
                    </span>
                  </button>
                  <button className="export-menu-item" onClick={() => runExport(buildTotalSummaryPDF)}>
                    <span className="export-menu-icon"><FaListAlt /></span>
                    <span className="export-menu-text">
                      <strong>Total Summary &amp; Full Register</strong>
                      <small>
                        Account totals, share split and the complete ledger with all payment logs
                        {transactions.length > 0 && ` · ${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`}
                      </small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
          {view === 'projects' && activeTab !== 4 && isAdminOrAccountant && (
            <button className="premium-btn premium-btn-primary" onClick={openNewProjectModal}>
              <FaPlus /> New Project
            </button>
          )}
          {view === 'entries' && isAdminOrAccountant && (
            <button className="premium-btn premium-btn-primary" onClick={() => setShowModal(true)}>
              <FaPlus /> Add Transaction
            </button>
          )}
        </div>
      </div>

      {/* Account Tabs */}
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

      {/* ── Projects View (Accounts 3 & 8) ── */}
      {view === 'projects' && activeTab !== 4 && (
        <div className="animate-fade-in">
          <div className="projects-section-header">
            <div className="projects-title-group">
              <FaBuilding className="projects-icon" />
              <div>
                <h2 className="projects-heading">Projects</h2>
                <p className="projects-subheading">Select a project to view and manage its balance entries</p>
              </div>
            </div>
          </div>

          {projectsLoading ? (
            <div className="projects-empty">
              <div className="projects-empty-icon">⏳</div>
              <p>Loading projects...</p>
            </div>
          ) : (
            <div className="projects-grid">
              {/* General / Unassigned card always shown */}
              {renderProjectCard(null, true)}
              {projects.map(proj => renderProjectCard(proj))}
              {projects.length === 0 && isAdminOrAccountant && (
                <div className="project-card project-card-new glass-card" onClick={openNewProjectModal}>
                  <div className="project-card-new-inner">
                    <FaPlus />
                    <span>Create First Project</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Entries View ── */}
      {view === 'entries' && (
        <div className="animate-fade-in">
          {/* Breadcrumb (only for project-scoped accounts) */}
          {activeTab !== 4 && (
            <div className="project-breadcrumb">
              <button className="back-to-projects-btn" onClick={backToProjects}>
                <FaArrowLeft /> All Projects
              </button>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-project">
                {selectedProject ? (
                  <><FaFolderOpen style={{ marginRight: '0.5rem', color: 'var(--primary)' }} />{selectedProject.name}</>
                ) : (
                  <><FaFolder style={{ marginRight: '0.5rem', color: 'var(--text-muted)' }} />General / Unassigned</>
                )}
              </span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="balance-summary-cards">
            <div className="balance-card" style={{ alignItems: 'flex-start' }}>
              <div className="card-icon" style={{ background: 'rgba(0,123,255,0.1)', color: '#007bff' }}>
                <FaWallet />
              </div>
              <div className="card-info" style={{ flex: 1 }}>
                <h3>Current Total Balance</h3>
                <div className={`amount ${totalBalance >= 0 ? 'text-success' : 'text-danger'}`}>
                  Rs. {totalBalance.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="balance-card">
              <div className="card-icon" style={{ background: 'rgba(255,193,7,0.1)', color: '#ffc107' }}>
                <FaHistory />
              </div>
              <div className="card-info">
                <h3>Recent Transactions</h3>
                <div className="amount">
                  {transactions.length} Records
                </div>
              </div>
            </div>
          </div>

          {/* Dealer Balance Cards */}
          {dealerBalances.length > 0 && (
            <div className="dealer-cards-grid animate-fade-in">
              {dealerBalances.map(db => (
                <div key={db.id} className="dealer-balance-card glass-card">
                  <div className="dealer-name">{db.name}</div>
                  <div className="dealer-stats">
                    <div className="stat">
                      <label>Balance</label>
                      <span className={`val ${db.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                        Rs. {db.balance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Transaction Table */}
          <div className="glass-card">
            <TableToolbar
              columns={BALANCE_COLUMNS}
              search={search}
              onSearchChange={setSearch}
              filters={filters}
              onFilterChange={setFilter}
              uniqueValues={uniqueValues}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
              onClearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
              searchPlaceholder="Search transactions by voucher, narration, dealer..."
              resultCount={filteredTransactions.length}
            />
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
                    {isAdminOrAccountant && <th style={{ width: '40px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" className="empty-state">Loading transactions...</td></tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr><td colSpan="9" className="empty-state">No transactions recorded for this project</td></tr>
                  ) : (
                    filteredTransactions.map((t) => {
                      const runningBalance = t._runningBalance;
                      const balanceChange = t._balanceChange;
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
                            <td data-label="Date">{new Date(t.transaction_date).toLocaleDateString()}</td>
                            <td data-label="Voucher #">
                              {t.voucher_no && <span className="voucher-badge">{t.voucher_no}</span>}
                              <div className="instrument-tag">{t.instrument} {t.instrument_number}</div>
                            </td>
                            <td className="td-wrap" data-label="Narration & Proof">
                              <div style={{ fontWeight: 600 }}>
                                {t.description}
                                {t.quantity && <span className="qty-badge"> (Qty: {t.quantity})</span>}
                              </div>
                              {(t.plot_info || t.customer_info) && (
                                <div className="entry-details-sub">
                                  {t.customer_info && <span><FaUser size={10} /> {t.customer_info}</span>}
                                  {t.plot_info && <span><FaMapMarkerAlt size={10} /> {t.plot_info}</span>}
                                </div>
                              )}
                              {t.proof_file && (
                                <a href={t.proof_file.startsWith('http') ? t.proof_file : (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + t.proof_file} target="_blank" rel="noopener noreferrer" className="proof-link">
                                  <FaExternalLinkAlt size={10} /> View Proof
                                </a>
                              )}
                            </td>
                            <td className="td-wrap" data-label="Dealer / Ref">
                              {(() => {
                                const names = new Set();
                                if (t.customer_name) names.add(t.customer_name + ' (Client)');
                                else if (t.user_name) names.add(t.user_name);
                                if (t.linked_entries) {
                                  t.linked_entries.forEach(e => {
                                    if (e.customer_name) names.add(e.customer_name + ' (Client)');
                                    else if (e.user_name) names.add(e.user_name);
                                  });
                                }
                                return Array.from(names).join(', ') || 'System / Admin';
                              })()}
                            </td>
                            <td data-label="Debit" className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                              {parseFloat(t.debit) > 0 ? parseFloat(t.debit).toLocaleString() : '-'}
                            </td>
                            <td data-label="Credit" className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                              {parseFloat(t.credit) > 0 ? parseFloat(t.credit).toLocaleString() : '-'}
                            </td>
                            <td data-label="Balance" className="amount-col">
                              <div style={{ fontWeight: 800, color: runningBalance >= 0 ? '#28a745' : '#dc3545' }}>
                                {runningBalance.toLocaleString()}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: balanceChange >= 0 ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                                {balanceChange >= 0 ? '+' : ''}{balanceChange.toLocaleString()}
                              </div>
                            </td>
                            {isAdminOrAccountant && (
                              <td data-label="Actions">
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button className="edit-btn" style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', padding: '5px' }} onClick={() => handleEditClick(t)} title="Edit Transaction">
                                    <FaEdit size={16} />
                                  </button>
                                  {/* Move to Project — only shown in General/Unassigned view */}
                                  {selectedProject === null && activeTab !== 4 && (
                                    <button
                                      className="move-to-project-btn"
                                      onClick={() => handleOpenMoveModal(t)}
                                      title="Move to Project"
                                    >
                                      <FaExchangeAlt size={14} />
                                    </button>
                                  )}
                                  <button
                                    className="delete-btn"
                                    style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', padding: '5px' }}
                                    onClick={() => handleDeleteTransaction(t)}
                                    disabled={deletingId === t.id}
                                    title={hasLinked
                                      ? 'Delete this balance entry (linked finance entries are kept)'
                                      : 'Delete this balance entry'}
                                  >
                                    <FaTrash size={15} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && hasLinked && (
                            <tr className="expanded-details-row">
                              <td colSpan={isAdminOrAccountant ? 9 : 8}>
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
                                          <a href={entry.proof_file.startsWith('http') ? entry.proof_file : (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace('/api', '') + entry.proof_file} target="_blank" rel="noopener noreferrer" className="proof-link small">
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
        </div>
      )}

      {/* ── New/Edit Project Modal ── */}
      {showProjectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingProject ? 'Edit Project' : 'New Project'}</h2>
              <button onClick={() => setShowProjectModal(false)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleProjectSubmit}>
              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text" className="form-control" required
                  placeholder="e.g. Phase 1 - Block A"
                  value={projectForm.name}
                  onChange={e => setProjectForm({ ...projectForm, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  className="form-control" rows="3"
                  placeholder="Brief description of this project..."
                  value={projectForm.description}
                  onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowProjectModal(false)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h2>
                New Balance Entry
                {selectedProject && (
                  <span className="modal-project-tag">
                    <FaFolderOpen /> {selectedProject.name}
                  </span>
                )}
              </h2>
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
                  <select
                    name="type" className="form-control"
                    value={formData.type} onChange={handleInputChange}
                  >
                    <option value="add">Credit (Increase Balance)</option>
                    <option value="deduct">Debit (Decrease Balance)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (Rs.)</label>
                  <input
                    type="number" name="amount" className="form-control" required
                    value={formData.amount} onChange={handleInputChange}
                  />
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
                  {formData.type === 'deduct' ? (
                    <div className="empty-selection">Finance entries can only be linked to Credit transactions</div>
                  ) : !formData.user_id ? (
                    <div className="empty-selection">Select a dealer to see available profits</div>
                  ) : availableFinanceEntries.length === 0 ? (
                    <div className="empty-selection">No unlinked finance entries for this dealer</div>
                  ) : (
                    <div className="finance-entries-list">
                      {availableFinanceEntries.map(entry => {
                        const isSelected = selectedFinanceEntries.find(e => e.line_id === entry.line_id);
                        return (
                          <div key={entry.line_id} className={`finance-entry-item ${isSelected ? 'selected' : ''}`} onClick={() => toggleFinanceEntry(entry)}>
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

      {/* ── Edit Transaction Modal ── */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Edit Transaction Details</h2>
              <button onClick={() => setShowEditModal(false)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Date</label>
                <input type="date" name="date" className="form-control" required value={editData.date} onChange={(e) => setEditData({ ...editData, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Voucher Number</label>
                <input type="text" name="voucher_no" className="form-control" value={editData.voucher_no} onChange={(e) => setEditData({ ...editData, voucher_no: e.target.value })} />
              </div>
              <div className="form-row-2" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Instrument</label>
                  <select name="instrument" className="form-control" value={editData.instrument} onChange={(e) => setEditData({ ...editData, instrument: e.target.value })}>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online Transfer</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Instrument Number</label>
                  <input type="text" name="instrument_number" className="form-control" value={editData.instrument_number} onChange={(e) => setEditData({ ...editData, instrument_number: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" className="form-control" required value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })}></textarea>
              </div>
              <div className="form-group">
                <label>Update Proof File (Optional)</label>
                <input type="file" className="form-control" accept="image/*" onChange={(e) => setEditData({ ...editData, proof_file: e.target.files[0] })} />
                <small style={{ color: 'var(--text-muted)' }}>Leave empty to keep the current proof file.</small>
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Update Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Move to Project Modal ── */}
      {moveTarget && (
        <div className="modal-overlay">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h2><FaExchangeAlt style={{ marginRight: '0.5rem', color: 'var(--primary)' }} />Move to Project</h2>
              <button onClick={() => setMoveTarget(null)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <div className="move-modal-entry-label">
              <span className="move-entry-desc">"{moveTarget.desc}"</span>
              <span className="move-entry-from">From: General / Unassigned</span>
            </div>
            <form onSubmit={handleMoveToProject}>
              <div className="form-group">
                <label>Select Target Project</label>
                <select
                  className="form-control"
                  required
                  value={moveProjectId}
                  onChange={e => setMoveProjectId(e.target.value)}
                >
                  <option value="">— Choose a project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {projects.length === 0 && (
                  <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                    No projects exist yet. Create a project first.
                  </small>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setMoveTarget(null)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary" disabled={!moveProjectId}>
                  <FaExchangeAlt /> Move Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageBalances;
