import React, { useState, useEffect } from 'react';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FaPlus, FaSearch, FaHistory, FaCog, FaFileUpload,
  FaWallet, FaCertificate, FaPiggyBank, FaTimes, FaExternalLinkAlt,
  FaChevronDown, FaChevronUp, FaCheckCircle, FaUser, FaMapMarkerAlt,
  FaEdit, FaArrowLeft, FaFolder, FaFolderOpen, FaTrash, FaEye,
  FaBuilding, FaExchangeAlt
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import './ManageBalances.css';

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
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // ── UI State ─────────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null); // null = new, obj = edit
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [adjustmentCost, setAdjustmentCost] = useState(20000);
  const [expandedRows, setExpandedRows] = useState({});

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
    instrument_number: '', user_id: '', proof_file: null,
    quantity: 1, plot_info: '', customer_info: '', is_random: false
  });

  const accounts = [
    { id: 3, name: 'Dealer Advances', icon: <FaWallet />, color: '#007bff' },
    { id: 8, name: 'Advance for Certificate', icon: <FaCertificate />, color: '#ffc107' },
    { id: 4, name: 'Savings Deposits', icon: <FaPiggyBank />, color: '#28a745' }
  ];

  // ── Fetch Helpers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchDealers();
    fetchCustomers();
    fetchSettings();
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
      setFormData(prev => ({
        ...prev, amount: '', quantity: 1,
        description: prev.is_random ? 'Random Certificate Use' : ''
      }));
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

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (err) { console.error('Error fetching customers:', err); }
  };

  const fetchAvailableFinance = async (userId) => {
    try {
      const res = await api.get(`/finance/entries?userId=${userId}&unlinkedOnly=true`);
      setAvailableFinanceEntries(res.data);
    } catch (err) { console.error('Error fetching finance entries:', err); }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      const costSetting = res.data.find(s => s.setting_key === 'ADJUSTMENT_FORM_DEFAULT_COST');
      if (costSetting) setAdjustmentCost(costSetting.setting_value);
    } catch (err) { console.error('Error fetching settings:', err); }
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
      setFormData(prev => {
        const qty = activeTab === 8 ? (Math.round(total / adjustmentCost) || 1) : 1;
        return {
          ...prev, amount: total.toString(), quantity: qty,
          description: `Transfer from Finance: ${newSelected.map(e => e.description).join(', ')}`
        };
      });
    } else {
      setFormData(prev => ({ ...prev, amount: '', quantity: 1, description: '' }));
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
      proof_file: null, quantity: 1, plot_info: '', customer_info: '', is_random: false,
      amount: '', type: 'add', date: new Date().toISOString().split('T')[0],
      description: '', voucher_no: ''
    });
    setSelectedFinanceEntries([]);
  };

  const updateAdjustmentCost = async () => {
    try {
      await api.put('/settings/ADJUSTMENT_FORM_DEFAULT_COST', { value: adjustmentCost });
      setShowSettings(false);
      alert('Setting updated successfully');
    } catch (err) {
      alert('Failed to update setting: ' + (err.response?.data?.message || err.message));
    }
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

  // ── Computed Values ───────────────────────────────────────────────────────────
  const totalBalance = transactions.reduce((sum, t) => {
    return sum + (parseFloat(t.credit) - parseFloat(t.debit));
  }, 0);

  const totalQuantity = activeTab === 8 ? transactions.reduce((sum, t) => {
    const q = parseInt(t.quantity) || 0;
    if (parseFloat(t.credit) > 0) return sum + q;
    if (parseFloat(t.debit) > 0) return sum - q;
    return sum;
  }, 0) : null;

  const entities = activeTab === 8 ? [...dealers, ...customers] : dealers;
  const dealerBalances = entities.map(d => {
    let balance = 0; let quantity = 0;
    transactions.forEach(t => {
      const dealerLinkedEntries = t.linked_entries ? t.linked_entries.filter(e => e.user_name === d.name || (e.customer_name && e.customer_name === d.name)) : [];
      if (dealerLinkedEntries.length > 0) {
        const contributedAmount = dealerLinkedEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        balance += contributedAmount;
        if (activeTab === 8) {
          const q = Math.round(contributedAmount / adjustmentCost) || 0;
          quantity += q;
        }
      } else if (!t.linked_entries || t.linked_entries.length === 0) {
        if (t.user_id === d.id || t.customer_id === d.id) {
          balance += (parseFloat(t.credit) - parseFloat(t.debit));
          const q = parseInt(t.quantity) || 0;
          if (parseFloat(t.credit) > 0) quantity += q;
          if (parseFloat(t.debit) > 0) quantity -= q;
        }
      }
    });
    return { ...d, balance, quantity, isCustomer: !d.role };
  }).filter(d => d.balance !== 0 || (activeTab === 8 && d.quantity !== 0));

  // ── PDF Export ────────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const accountName = accounts.find(a => a.id === activeTab)?.name || 'Account';
    const projectLabel = selectedProject ? ` — ${selectedProject.name}` : ' — General';

    doc.setFontSize(18);
    doc.text(`Balance Report: ${accountName}${projectLabel}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    const tableColumn = ["Date", "Voucher #", "Instrument", "Dealer / Ref", "Debit", "Credit", "Balance"];
    const tableRows = [];
    let totalDebit = 0; let totalCredit = 0;

    transactions.forEach((t, idx) => {
      const runningBalance = transactions.slice(idx).reduce((sum, item) => {
        return sum + (parseFloat(item.credit) - parseFloat(item.debit));
      }, 0);
      const debitVal = parseFloat(t.debit) || 0;
      const creditVal = parseFloat(t.credit) || 0;
      totalDebit += debitVal;
      totalCredit += creditVal;

      const names = new Set();
      if (t.customer_name) names.add(t.customer_name + ' (Client)');
      else if (t.user_name) names.add(t.user_name);
      if (t.linked_entries) {
        t.linked_entries.forEach(e => {
          if (e.customer_name) names.add(e.customer_name + ' (Client)');
          else if (e.user_name) names.add(e.user_name);
        });
      }
      const dealerRef = Array.from(names).join(', ') || 'System / Admin';
      const instrumentStr = `${t.instrument || ''} ${t.instrument_number || ''}`.trim() || '-';

      tableRows.push([
        new Date(t.transaction_date).toLocaleDateString(),
        t.voucher_no || '-', instrumentStr, dealerRef,
        debitVal > 0 ? debitVal.toLocaleString() : '-',
        creditVal > 0 ? creditVal.toLocaleString() : '-',
        runningBalance.toLocaleString()
      ]);
    });

    autoTable(doc, {
      head: [tableColumn], body: tableRows,
      foot: [[
        { content: 'Totals', colSpan: 4, styles: { halign: 'right' } },
        totalDebit.toLocaleString(), totalCredit.toLocaleString(),
        (totalCredit - totalDebit).toLocaleString()
      ]],
      startY: 40, theme: 'grid', styles: { fontSize: 10 },
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`Balances_${accountName}_${projectLabel.replace(' — ', '')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ── Render: Project Card ──────────────────────────────────────────────────────
  const renderProjectCard = (proj, isGeneral = false) => {
    // Balance and entry count are tab-specific so numbers match what you see inside
    const balance = isGeneral ? null : (
      activeTab === 3 ? parseFloat(proj.advances_balance || 0) :
      activeTab === 8 ? parseFloat(proj.certificate_balance || 0) :
      parseFloat(proj.total_balance || 0)
    );
    const entries = isGeneral ? '—' : (
      activeTab === 3 ? parseInt(proj.advances_count || 0) :
      activeTab === 8 ? parseInt(proj.certificate_count || 0) :
      parseInt(proj.entry_count || 0)
    );

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
            <button className="premium-btn premium-btn-secondary" onClick={exportToPDF}>
              <FaFileUpload /> Export PDF
            </button>
          )}
          {isAdminOrAccountant && (
            <button className="premium-btn premium-btn-secondary" onClick={() => setShowSettings(true)}>
              <FaCog /> Settings
            </button>
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
                {dealerBalances.length > 0 && (
                  <div className="dealer-contributions-list">
                    {dealerBalances.map(db => (
                      <div key={db.id} className="dealer-contrib-item">
                        <span className="dealer-name">{db.name}</span>
                        <span className={`dealer-amount ${db.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                          Rs. {db.balance.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="balance-card">
              <div className="card-icon" style={{ background: 'rgba(255,193,7,0.1)', color: '#ffc107' }}>
                <FaHistory />
              </div>
              <div className="card-info">
                <h3>{activeTab === 8 ? 'Total Forms' : 'Recent Transactions'}</h3>
                <div className="amount">
                  {activeTab === 8 ? `${totalQuantity} Certificates` : `${transactions.length} Records`}
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
                    {activeTab === 8 && (
                      <div className="stat">
                        <label>Forms</label>
                        <span className="val">{db.quantity}</span>
                      </div>
                    )}
                    <div className="stat">
                      <label>{activeTab === 8 ? 'Value' : 'Balance'}</label>
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
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Date</th>
                    <th>Voucher #</th>
                    <th>{activeTab === 8 ? 'Details & Narration' : 'Narration & Proof'}</th>
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
                  ) : transactions.length === 0 ? (
                    <tr><td colSpan="9" className="empty-state">No transactions recorded for this project</td></tr>
                  ) : (
                    transactions.map((t, idx) => {
                      const runningBalance = transactions.slice(idx).reduce((sum, item) => {
                        return sum + (parseFloat(item.credit) - parseFloat(item.debit));
                      }, 0);
                      const balanceChange = parseFloat(t.credit) - parseFloat(t.debit);
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
                            <td>
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
                            <td className="amount-col" style={{ color: '#dc3545', fontWeight: 600 }}>
                              {parseFloat(t.debit) > 0 ? parseFloat(t.debit).toLocaleString() : '-'}
                            </td>
                            <td className="amount-col" style={{ color: '#28a745', fontWeight: 600 }}>
                              {parseFloat(t.credit) > 0 ? parseFloat(t.credit).toLocaleString() : '-'}
                            </td>
                            <td className="amount-col">
                              <div style={{ fontWeight: 800, color: runningBalance >= 0 ? '#28a745' : '#dc3545' }}>
                                {runningBalance.toLocaleString()}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: balanceChange >= 0 ? '#28a745' : '#dc3545', fontWeight: 600 }}>
                                {balanceChange >= 0 ? '+' : ''}{balanceChange.toLocaleString()}
                              </div>
                            </td>
                            {isAdminOrAccountant && (
                              <td>
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
                    disabled={formData.is_random}
                  >
                    <option value="add">Credit (Increase Balance)</option>
                    <option value="deduct">Debit (Decrease Balance)</option>
                  </select>
                </div>
                {activeTab === 8 && (
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox" name="is_random" checked={formData.is_random}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData(prev => ({
                            ...prev, is_random: checked,
                            type: checked ? 'deduct' : prev.type,
                            description: checked ? 'Random Certificate Use' : prev.description
                          }));
                        }}
                      />
                      Random Entry (External Plot/Customer)
                    </label>
                  </div>
                )}
                {activeTab === 8 && (
                  <div className="form-group">
                    <label>Quantity (Number of Forms)</label>
                    <input
                      type="number" name="quantity" className="form-control" min="1"
                      value={formData.quantity}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 1;
                        setFormData(prev => ({ ...prev, quantity: qty, amount: (qty * adjustmentCost).toString() }));
                      }}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>Amount (Rs.)</label>
                  <input
                    type="number" name="amount" className="form-control" required
                    value={formData.amount} onChange={handleInputChange}
                    readOnly={activeTab === 8}
                  />
                  {activeTab === 8 && <small>Calculated based on quantity</small>}
                </div>
                {formData.is_random && (
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Customer Name</label>
                      <input type="text" name="customer_info" className="form-control" required={formData.is_random} value={formData.customer_info} onChange={handleInputChange} />
                    </div>
                    <div className="form-group">
                      <label>Plot Details</label>
                      <input type="text" name="plot_info" className="form-control" required={formData.is_random} value={formData.plot_info} onChange={handleInputChange} />
                    </div>
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

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Global Settings</h2>
              <button onClick={() => setShowSettings(false)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <div className="form-group">
              <label>Adjustment Form Default Cost (Rs.)</label>
              <input
                type="number" className="form-control"
                value={adjustmentCost}
                onChange={(e) => setAdjustmentCost(e.target.value)}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                This is the amount deducted from your Certificate balance when an adjustment is added to a deal.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
              <button type="button" className="premium-btn premium-btn-primary" onClick={updateAdjustmentCost}>Update Setting</button>
            </div>
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
