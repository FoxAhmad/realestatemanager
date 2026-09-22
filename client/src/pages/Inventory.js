import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import {
  FaChevronDown, FaChevronUp, FaCheckCircle, FaFolder, FaFolderOpen,
  FaEye, FaArrowLeft, FaTrash, FaPlus
} from 'react-icons/fa';
import './Inventory.css';

const INVENTORY_CATEGORY_LABELS = {
  plot: 'Plot',
  house: 'House',
  shop_office: 'Shop/Office',
};

const INVENTORY_COLUMNS = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'project_name', label: 'Project', type: 'text' },
  { key: 'category', label: 'Category', type: 'enum', formatOption: (v) => INVENTORY_CATEGORY_LABELS[v] || v },
  { key: 'size', label: 'Type/Size', type: 'text', accessor: (r) => [r.plot_type, r.plot_category, r.size].filter(Boolean).join(' ') },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'price', label: 'Price', type: 'currency' },
  { key: 'quantity', label: 'Qty', type: 'number' },
  { key: 'status', label: 'Status', type: 'enum' },
  { key: 'assigned_to_name', label: 'Assigned To', type: 'text' },
];

const Inventory = () => {
  const { isAdmin, isAccountant, isEmployee, user } = useAuth();
  const canEdit = isAdmin || isAccountant;
  const [inventory, setInventory] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [view, setView] = useState('projects'); // 'projects' | 'plots'
  const [selectedProjectKey, setSelectedProjectKey] = useState(null); // 'unassigned' | String(project.id)
  const [editingPlotId, setEditingPlotId] = useState(null);
  const [plotEditForm, setPlotEditForm] = useState({
    plot_number: '', plot_category: 'standard', plot_type: 'R', size: '',
    block: '', membership_no: '', registration_no: '', form_number: ''
  });
  const [balanceProjects, setBalanceProjects] = useState([]);
  const [dealInfo, setDealInfo] = useState({});
  const [expandedPlotRows, setExpandedPlotRows] = useState({});
  const [formData, setFormData] = useState({
    category: 'plot',
    address: '',
    price: '',
    quantity: 1,
    plot_numbers: '',
    plot_type: 'R',
    plot_category: 'standard',
    size: '',
    project_id: '',
    block: '',
    membership_no: '',
    registration_no: '',
    form_number: ''
  });
  const [selectedPlots, setSelectedPlots] = useState([]);
  const [assignmentPayment, setAssignmentPayment] = useState({
    amount_paid: '',
    notes: '',
  });
  const [showPaymentModal, setShowPaymentModal] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [investorBalances, setInvestorBalances] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    inventory_id: null,
    plot_id: null,
    investors: [],
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredInventory,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(inventory, INVENTORY_COLUMNS);

  useEffect(() => {
    fetchInventory();
    fetchBalanceProjects();
    if (canEdit) {
      fetchSalespersons();
      // Admins and Accountants can also assign to themselves and pay, so fetch investors
      fetchInvestors();
      if (user) {
        fetchInvestorBalances();
      }
    } else {
      // For salespersons/employees, also fetch investors for payments
      fetchInvestors();
      if (user) {
        fetchInvestorBalances();
      }
    }
  }, [user]);


  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      // Backend returns only assigned inventory for salespersons
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalespersons = async () => {
    try {
      const response = await api.get('/dealers');
      setSalespersons(response.data);
    } catch (error) {
      console.error('Error fetching salespersons:', error);
    }
  };

  const fetchBalanceProjects = async () => {
    try {
      const response = await api.get('/balance-projects');
      setBalanceProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const handleAddProjectQuick = async () => {
    const name = window.prompt('New project name (e.g. Union Town):');
    if (!name || !name.trim()) return;
    try {
      const response = await api.post('/balance-projects', { name: name.trim() });
      setBalanceProjects(prev => [...prev, response.data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData(prev => ({ ...prev, project_id: response.data.id }));
    } catch (error) {
      alert(error.response?.data?.message || 'Error creating project');
    }
  };

  const handleDeleteProjectQuick = async (proj) => {
    if (!window.confirm(`Delete project "${proj.name}"? Inventory in this project will become unassigned.`)) return;
    try {
      await api.delete(`/balance-projects/${proj.id}`);
      setBalanceProjects(prev => prev.filter(p => p.id !== proj.id));
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Error deleting project');
    }
  };

  const toggleDealRow = async (plotId) => {
    setExpandedPlotRows(prev => ({ ...prev, [plotId]: !prev[plotId] }));
    if (dealInfo[plotId] !== undefined) return;
    setDealInfo(prev => ({ ...prev, [plotId]: 'loading' }));
    try {
      const response = await api.get(`/inventory/plots/${plotId}/deal`);
      setDealInfo(prev => ({ ...prev, [plotId]: response.data.deal }));
    } catch (error) {
      setDealInfo(prev => ({ ...prev, [plotId]: null }));
    }
  };

  const fetchInvestors = async () => {
    try {
      const response = await api.get('/investors');
      setInvestors(response.data);
    } catch (error) {
      console.error('Error fetching investors:', error);
    }
  };

  const fetchInvestorBalances = async () => {
    try {
      if (user) {
        const response = await api.get(`/inventory-payments/salesperson/${user.id}/investors/balances`);
        setInvestorBalances(response.data);
      }
    } catch (error) {
      console.error('Error fetching investor balances:', error);
    }
  };

  const getInvestorBalance = (investorId) => {
    return investorBalances.find(b => b.id === investorId) || null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.put(
          `/inventory/${editingItem.id}`,
          { ...formData, merge_ids: editingItem.ids }
        );
      } else {
        await api.post('/inventory', formData);
      }
      fetchInventory();
      setShowModal(false);
      setEditingItem(null);
      setFormData({
        category: 'plot',
        address: '',
        price: '',
        quantity: 1,
        plot_numbers: '',
        plot_type: 'R',
        plot_category: 'standard',
        size: '',
        project_id: '',
        block: '',
        membership_no: '',
        registration_no: '',
        form_number: ''
      });
    } catch (error) {
      console.error('Error saving inventory:', error);
      alert(error.response?.data?.message || 'Error saving inventory');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      address: item.address,
      price: item.price,
      quantity: item.quantity || 1,
      plot_numbers: item.plot_numbers_input || '',
      plot_type: item.plot_type || 'R',
      plot_category: item.plot_category || 'standard',
      size: item.size || '',
      project_id: item.project_id || '',
      block: item.block || '',
      membership_no: item.membership_no || '',
      registration_no: item.registration_no || '',
      form_number: item.form_number || '',
    });
    setShowModal(true);
  };

  const handleUpdatePlot = async (plotId) => {
    try {
      await api.put(`/inventory/plots/${plotId}`, plotEditForm);
      alert('Plot updated successfully');
      setEditingPlotId(null);
      // Refresh main inventory list (plots are embedded in it)
      fetchInventory();
    } catch (error) {
      alert(error.response?.data?.message || 'Error updating plot');
    }
  };

  const parsePlotNumbers = (input) => {
    if (!input) return [];
    return input
      .split(/[,\n;]/)
      .map(num => num.trim())
      .filter(num => num.length > 0);
  };

  const handlePlotNumbersChange = (e) => {
    const value = e.target.value;
    setFormData({ ...formData, plot_numbers: value });

    // Auto-update quantity based on plot numbers
    const parsed = parsePlotNumbers(value);
    if (parsed.length > 0) {
      setFormData(prev => ({ ...prev, quantity: parsed.length }));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this inventory item?')) {
      try {
        await api.delete(`/inventory/${id}`);
        fetchInventory();
      } catch (error) {
        console.error('Error deleting inventory:', error);
        alert('Error deleting inventory');
      }
    }
  };

  const getStatusBadge = (status, item = null) => {


    // If item has plot assignments, show partial status if applicable
    if (item && item.plot_assignments && item.plot_assignments.length > 0) {
      const totalPlots = (item.plot_assignments.reduce((sum, a) => sum + a.plots.length, 0) || 0) + (item.unassigned_plots?.length || 0);
      const assignedPlots = item.plot_assignments.reduce((sum, a) => sum + a.plots.length, 0);

      if (assignedPlots > 0 && assignedPlots < totalPlots) {
        return <span className="premium-badge premium-badge-warning">Partially Assigned</span>;
      }
    }

    if (!canEdit) {
      // For employees/salespersons, simplify status to Sold/Unsold
      if (status === 'available') return <span className="premium-badge premium-badge-success">Unsold</span>;
      return <span className="premium-badge premium-badge-primary">Sold</span>;
    }

    const badges = {
      available: <span className="premium-badge premium-badge-success">Unsold</span>,
      assigned: <span className="premium-badge premium-badge-warning">Assigned</span>,
      paid: <span className="premium-badge premium-badge-info">Paid</span>,
      sold: <span className="premium-badge premium-badge-primary">Sold</span>,
      used_in_deal: <span className="premium-badge premium-badge-primary">In Deal</span>,
    };
    return badges[status] || status;
  };

  const getCategoryLabel = (category) => {
    const labels = {
      plot: 'Plot',
      house: 'House',
      shop_office: 'Shop/Office',
    };
    return labels[category] || category;
  };

  const handleOpenPaymentModal = (item, plot = null) => {
    const assignedPlots = item.assigned_plots || [];
    // If no specific plot provided and there are multiple plots, use the first one
    // If there's only one plot, use it
    let selectedPlot = plot;
    if (!selectedPlot && assignedPlots.length === 1) {
      selectedPlot = assignedPlots[0];
    } else if (!selectedPlot && assignedPlots.length > 1) {
      // For multiple plots, we'll let the user select in the modal
      selectedPlot = null;
    }

    setShowPaymentModal({ inventory: item, plot: selectedPlot, allPlots: assignedPlots });
    setPaymentForm({
      inventory_id: item.id,
      plot_id: selectedPlot ? selectedPlot.id : null,
      investors: [],
      payment_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
  };

  const handleAddInvestorToPayment = () => {
    setPaymentForm({
      ...paymentForm,
      investors: [...paymentForm.investors, { investor_id: '', amount: '' }]
    });
  };

  const handleRemoveInvestorFromPayment = (index) => {
    setPaymentForm({
      ...paymentForm,
      investors: paymentForm.investors.filter((_, i) => i !== index)
    });
  };

  const handleInvestorPaymentChange = (index, field, value) => {
    const updatedInvestors = [...paymentForm.investors];
    updatedInvestors[index] = { ...updatedInvestors[index], [field]: value };
    setPaymentForm({ ...paymentForm, investors: updatedInvestors });
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    try {
      // Validate investors array
      if (paymentForm.investors.length === 0) {
        alert('Please add at least one investor');
        return;
      }

      // Validate all investors have ID and amount
      for (const inv of paymentForm.investors) {
        if (!inv.investor_id || !inv.amount || parseFloat(inv.amount) <= 0) {
          alert('Please fill in all investor fields with valid amounts');
          return;
        }
      }

      const response = await api.post('/inventory-payments', {
        inventory_id: paymentForm.inventory_id,
        plot_id: paymentForm.plot_id,
        investors: paymentForm.investors.map(inv => ({
          investor_id: parseInt(inv.investor_id),
          amount: parseFloat(inv.amount)
        })),
        payment_date: paymentForm.payment_date,
        notes: paymentForm.notes || null
      });

      alert('Payment submitted successfully!');
      setShowPaymentModal(null);
      setPaymentForm({
        inventory_id: null,
        plot_id: null,
        investors: [],
        payment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      fetchInventory();
      fetchInvestorBalances();
    } catch (error) {
      console.error('Error submitting payment:', error);
      alert(error.response?.data?.message || 'Error submitting payment');
    }
  };

  const getProjectKey = (item) => (item.project_id ? String(item.project_id) : 'unassigned');

  const getProjectSummaries = () => {
    const stats = {};
    inventory.forEach(item => {
      const key = getProjectKey(item);
      if (!stats[key]) stats[key] = { plotCount: 0, totalPrice: 0, listingCount: 0 };
      const plots = [...(item.plots || []), ...(item.assigned_plots || [])];
      const plotCount = plots.length || parseInt(item.quantity || 0);
      stats[key].plotCount += plotCount;
      stats[key].totalPrice += parseFloat(item.price || 0);
      stats[key].listingCount += 1;
    });

    const projectCards = balanceProjects.map(p => ({
      id: p.id,
      key: String(p.id),
      name: p.name,
      description: p.description,
      isGeneral: false,
      ...(stats[String(p.id)] || { plotCount: 0, totalPrice: 0, listingCount: 0 })
    }));

    const unassigned = {
      id: null,
      key: 'unassigned',
      name: 'No Project',
      description: 'Inventory not yet assigned to a project',
      isGeneral: true,
      ...(stats.unassigned || { plotCount: 0, totalPrice: 0, listingCount: 0 })
    };

    return { projectCards, unassigned };
  };

  const getPlotsFromItems = (items) => {
    const rows = [];
    items.forEach(item => {
      const plots = [...(item.plots || []), ...(item.assigned_plots || [])];
      plots.forEach(p => {
        rows.push({
          ...p,
          id: p.plot_id || p.id,
          status: p.plot_status || p.status,
          _item: item,
        });
      });
    });
    return rows.sort((a, b) => (a.plot_number || '').localeCompare(b.plot_number || ''));
  };

  const renderProjectCard = (proj) => (
    <div key={proj.key} className={`project-card glass-card ${proj.isGeneral ? 'project-card-general' : ''}`}>
      <div className="project-card-icon">
        {proj.isGeneral ? <FaFolder /> : <FaFolderOpen />}
      </div>
      <div className="project-card-body">
        <div className="project-card-name">{proj.name}</div>
        {proj.description && <div className="project-card-desc">{proj.description}</div>}
        <div className="project-card-stats">
          <div className="project-stat">
            <span className="stat-label">Plots</span>
            <span className="stat-val">{proj.plotCount}</span>
          </div>
          <div className="project-stat">
            <span className="stat-label">Base Price Total</span>
            <span className="stat-val">Rs. {proj.totalPrice.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div className="project-card-actions">
        <button
          className="project-view-btn"
          onClick={() => { setSelectedProjectKey(proj.key); setView('plots'); }}
        >
          <FaEye /> View Plots
        </button>
        {!proj.isGeneral && canEdit && (
          <div className="project-edit-actions">
            <button className="project-icon-btn delete" onClick={() => handleDeleteProjectQuick(proj)} title="Delete project">
              <FaTrash />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div className="inventory-loading">Loading inventory...</div>;
  }

  if (view === 'projects') {
    const { projectCards, unassigned } = getProjectSummaries();
    return (
      <div className="premium-page">
        <div className="premium-page-header">
          <div>
            <h1 className="premium-page-title">Inventory Control</h1>
            <p>Select a project to manage its plots.</p>
          </div>
          <div className="header-actions">
            {canEdit && (
              <button className="premium-btn premium-btn-primary" onClick={handleAddProjectQuick}>
                <FaPlus /> New Project
              </button>
            )}
          </div>
        </div>
        <div className="projects-grid">
          {renderProjectCard(unassigned)}
          {projectCards.map(proj => renderProjectCard(proj))}
        </div>
      </div>
    );
  }

  const selectedProjectSummary = (() => {
    const { projectCards, unassigned } = getProjectSummaries();
    return selectedProjectKey === 'unassigned' ? unassigned : (projectCards.find(p => p.key === selectedProjectKey) || unassigned);
  })();

  const itemsInSelectedProject = filteredInventory.filter(item => getProjectKey(item) === selectedProjectKey);
  const plotsInSelectedProject = getPlotsFromItems(itemsInSelectedProject);

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1 className="premium-page-title">Inventory Control</h1>
          <p>Manage and track your real estate assets across all developments.</p>
        </div>
        <div className="header-actions">
          {canEdit && (
            <button
              className="premium-btn premium-btn-primary"
              onClick={() => {
                setEditingItem(null);
                setFormData({
                  category: 'plot', address: '', price: '', plot_numbers: '', quantity: 1,
                  plot_type: 'R', plot_category: 'standard', size: '',
                  project_id: selectedProjectSummary.id || '',
                  block: '', membership_no: '', registration_no: '', form_number: ''
                });
                setShowModal(true);
              }}
            >
              + Add New Inventory
            </button>
          )}
        </div>
      </div>

      <div className="project-breadcrumb">
        <button className="back-to-projects-btn" onClick={() => { setView('projects'); setSelectedProjectKey(null); }}>
          <FaArrowLeft /> All Projects
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-project">
          {selectedProjectSummary.isGeneral
            ? <><FaFolder style={{ marginRight: '0.5rem', color: 'var(--text-muted)' }} />{selectedProjectSummary.name}</>
            : <><FaFolderOpen style={{ marginRight: '0.5rem', color: 'var(--primary)' }} />{selectedProjectSummary.name}</>}
        </span>
      </div>

      <div className="glass-card">
        <TableToolbar
          columns={INVENTORY_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search inventory by address, category, status..."
          resultCount={plotsInSelectedProject.length}
        />
      <div className="premium-table-container">
        <table className="premium-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Plot #</th>
              <th>Listing / Address</th>
              <th>Block</th>
              <th>Factor</th>
              <th>Type</th>
              <th>Status</th>
              {canEdit && <th>Size</th>}
              {canEdit && <th>Membership #</th>}
              {canEdit && <th>Assigned To</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plotsInSelectedProject.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 11 : 8} className="empty-state">No plots in this project yet</td>
              </tr>
            ) : (
              plotsInSelectedProject.map(plot => {
                const hasPossibleDeal = plot.status !== 'available';
                const isExpanded = !!expandedPlotRows[plot.id];
                const deal = dealInfo[plot.id];
                const colSpan = canEdit ? 11 : 8;

                return (
                  <React.Fragment key={plot.id}>
                    <tr>
                      {editingPlotId === plot.id ? (
                        <>
                          <td></td>
                          <td data-label="Plot #">
                            <input
                              type="text"
                              value={plotEditForm.plot_number}
                              onChange={e => setPlotEditForm({...plotEditForm, plot_number: e.target.value})}
                            />
                            <input
                              type="text"
                              value={plotEditForm.registration_no}
                              onChange={e => setPlotEditForm({...plotEditForm, registration_no: e.target.value})}
                              placeholder="Registration #"
                              style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                            />
                            <input
                              type="text"
                              value={plotEditForm.form_number}
                              onChange={e => setPlotEditForm({...plotEditForm, form_number: e.target.value})}
                              placeholder="Form # / Code"
                              style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}
                            />
                          </td>
                          <td data-label="Listing / Address">{plot._item.address}</td>
                          <td data-label="Block">
                            <input
                              type="text"
                              value={plotEditForm.block}
                              onChange={e => setPlotEditForm({...plotEditForm, block: e.target.value})}
                              placeholder="e.g. E"
                            />
                          </td>
                          <td data-label="Factor">
                            <input
                              type="text"
                              value={plotEditForm.plot_category}
                              onChange={e => setPlotEditForm({...plotEditForm, plot_category: e.target.value})}
                              placeholder="e.g. Corner"
                            />
                          </td>
                          <td data-label="Type">
                            <select
                              value={plotEditForm.plot_type}
                              onChange={e => setPlotEditForm({...plotEditForm, plot_type: e.target.value})}
                            >
                              <option value="R">Residential (R)</option>
                              <option value="C">Commercial (C)</option>
                            </select>
                          </td>
                          <td data-label="Status">{getStatusBadge(plot.status)}</td>
                          <td data-label="Size">
                            <input
                              type="text"
                              value={plotEditForm.size}
                              onChange={e => setPlotEditForm({...plotEditForm, size: e.target.value})}
                              placeholder="e.g. 3.33 Marla"
                            />
                          </td>
                          <td data-label="Membership #">
                            <input
                              type="text"
                              value={plotEditForm.membership_no}
                              onChange={e => setPlotEditForm({...plotEditForm, membership_no: e.target.value})}
                              placeholder="Membership #"
                            />
                          </td>
                          <td data-label="Assigned To">{plot.assigned_to_name || '-'}</td>
                          <td data-label="Actions">
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="premium-btn premium-btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleUpdatePlot(plot.id)}>Save</button>
                              <button className="premium-btn premium-btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setEditingPlotId(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>
                            {hasPossibleDeal && (
                              <button className="expand-btn" onClick={() => toggleDealRow(plot.id)} title="View linked deal">
                                {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                              </button>
                            )}
                          </td>
                          <td data-label="Plot #">{plot.plot_number}</td>
                          <td data-label="Listing / Address">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span>{plot._item.address}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {getCategoryLabel(plot._item.category)} · Rs. {parseFloat(plot._item.price || 0).toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td data-label="Block">{plot.block || '-'}</td>
                          <td data-label="Factor">{plot.plot_category?.replace('_', ' ') || 'Standard'}</td>
                          <td data-label="Type">{plot.plot_type || 'R'}</td>
                          <td data-label="Status">{getStatusBadge(plot.status)}</td>
                          {canEdit && <td data-label="Size">{plot.size || '-'}</td>}
                          {canEdit && <td data-label="Membership #">{plot.membership_no || '-'}</td>}
                          {canEdit && <td data-label="Assigned To">{plot.assigned_to_name || '-'}</td>}
                          <td data-label="Actions">
                            {canEdit ? (
                              <div className="action-buttons">
                                <button
                                  className="premium-btn premium-btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  onClick={() => {
                                    setEditingPlotId(plot.id);
                                    setPlotEditForm({
                                      plot_number: plot.plot_number || '',
                                      plot_category: plot.plot_category || 'standard',
                                      plot_type: plot.plot_type || 'R',
                                      size: plot.size || '',
                                      block: plot.block || '',
                                      membership_no: plot.membership_no || '',
                                      registration_no: plot.registration_no || '',
                                      form_number: plot.form_number || ''
                                    });
                                  }}
                                >
                                  Edit Plot
                                </button>
                                <button
                                  className="premium-btn premium-btn-secondary"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  onClick={() => handleEdit(plot._item)}
                                >
                                  Edit Listing
                                </button>
                                <button
                                  className="premium-btn premium-btn-danger"
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  onClick={() => handleDelete(plot._item.id)}
                                >
                                  Delete Listing
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn-primary"
                                style={{ fontSize: '0.8125rem' }}
                                onClick={() => handleOpenPaymentModal(plot._item, plot)}
                              >
                                Pay
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                    {isExpanded && hasPossibleDeal && (
                      <tr className="expanded-details-row">
                        <td colSpan={colSpan}>
                          <div className="linked-entries-detail">
                            <h4><FaCheckCircle color="var(--success)" /> Linked Deal</h4>
                            {deal === 'loading' && <p>Loading...</p>}
                            {deal === null && <p>No deal found for this plot.</p>}
                            {deal && deal !== 'loading' && (
                              <div className="linked-grid">
                                <div className="linked-item-card">
                                  <div className="linked-item-header">
                                    <span className="date">{new Date(deal.created_at).toLocaleDateString()}</span>
                                    <span className="dealer-badge">{deal.status}</span>
                                  </div>
                                  <div className="linked-item-body">
                                    <span className="amount">Rs. {parseFloat(deal.sale_price || 0).toLocaleString()}</span>
                                    <p>{deal.customer_name || 'Unnamed Customer'}{deal.dealer_name ? ` · ${deal.dealer_name}` : ''}</p>
                                    <div className="entry-details-sub">
                                      <span>Paid: Rs. {parseFloat(deal.total_paid || 0).toLocaleString()}</span>
                                      <span>Remaining: Rs. {parseFloat(deal.remaining_balance || 0).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <a href={`/deals/${deal.id}`} className="proof-link small">View Full Deal</a>
                                </div>
                              </div>
                            )}
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingItem ? 'Edit Inventory' : 'Add Inventory'} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>— {selectedProjectSummary.name}</span></h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  required
                >
                  <option value="plot">Plot</option>
                  <option value="house">House</option>
                  <option value="shop_office">Shop/Office</option>
                </select>
              </div>
              <div className="form-group">
                <label>Address *</label>
                <textarea
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  required
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>Price *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Plot Numbers</label>
                <textarea
                  value={formData.plot_numbers}
                  onChange={handlePlotNumbersChange}
                  rows="4"
                  placeholder="Enter plot numbers separated by commas or new lines (e.g., Plot-1, Plot-2, Plot-3)"
                />
                <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                  Enter plot numbers separated by commas or new lines. Quantity will be auto-calculated.
                </small>
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  required
                />
                {formData.plot_numbers && (
                  <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                    Parsed {parsePlotNumbers(formData.plot_numbers).length} plot number(s)
                  </small>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label>Plot Type</label>
                  <select
                    value={formData.plot_type}
                    onChange={(e) => setFormData({ ...formData, plot_type: e.target.value })}
                  >
                    <option value="R">Residential (R)</option>
                    <option value="C">Commercial (C)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Plot Category</label>
                  <input
                    type="text"
                    value={formData.plot_category}
                    onChange={(e) => setFormData({ ...formData, plot_category: e.target.value })}
                    placeholder="e.g. Standard, Corner, Park Face"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Plot Size</label>
                <input
                  type="text"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="e.g. 5 Marla, 10 Marla"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label>Block</label>
                  <input
                    type="text"
                    value={formData.block}
                    onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                    placeholder="e.g. E"
                  />
                </div>
                <div className="form-group">
                  <label>Membership #</label>
                  <input
                    type="text"
                    value={formData.membership_no}
                    onChange={(e) => setFormData({ ...formData, membership_no: e.target.value })}
                    placeholder="Membership #"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1rem' }}>
                <div className="form-group">
                  <label>Registration #</label>
                  <input
                    type="text"
                    value={formData.registration_no}
                    onChange={(e) => setFormData({ ...formData, registration_no: e.target.value })}
                    placeholder="Registration #"
                  />
                </div>
                <div className="form-group">
                  <label>Form # / Code</label>
                  <input
                    type="text"
                    value={formData.form_number}
                    onChange={(e) => setFormData({ ...formData, form_number: e.target.value })}
                    placeholder="Form # / Code"
                  />
                </div>
              </div>
              {editingItem && (
                <small style={{ color: '#666', display: 'block', marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  Block / Membership / Registration / Form # apply to every plot in this listing. Leave blank to keep each plot's existing value.
                </small>
              )}
               <div className="modal-actions">
                <button
                  type="button"
                  className="premium-btn premium-btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Retired: Assign Inventory Modal */}
      {/* Retired: Request Inventory Modal */}

      {/* Payment Modal for Salespersons & Admins/Accountants */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Make Payment for Inventory</h2>
            <form onSubmit={handleSubmitPayment}>
              <div className="form-group">
                <label>Inventory</label>
                <input
                  type="text"
                  value={`${getCategoryLabel(showPaymentModal.inventory.category)} - ${showPaymentModal.inventory.address}`}
                  disabled
                />
              </div>

              {showPaymentModal.allPlots && showPaymentModal.allPlots.length > 1 && (
                <div className="form-group">
                  <label>Select Plot to Pay For *</label>
                  <select
                    value={paymentForm.plot_id || ''}
                    onChange={(e) => {
                      const selectedPlotId = e.target.value ? parseInt(e.target.value) : null;
                      const selectedPlot = showPaymentModal.allPlots.find(p => p.id === selectedPlotId);
                      setPaymentForm({ ...paymentForm, plot_id: selectedPlotId });
                      setShowPaymentModal({ ...showPaymentModal, plot: selectedPlot || null });
                    }}
                    required
                  >
                    <option value="">Select a plot</option>
                    {showPaymentModal.allPlots.map((plot) => (
                      <option key={plot.id} value={plot.id}>
                        {plot.plot_number} ({plot.status})
                        {plot.investors && plot.investors.length > 0 &&
                          ` - Paid: Rs. ${plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}`
                        }
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                    Select which plot you want to pay for
                  </small>
                </div>
              )}

              {showPaymentModal.plot && (
                <div className="form-group">
                  <label>Plot</label>
                  <input
                    type="text"
                    value={showPaymentModal.plot.plot_number}
                    disabled
                  />
                  {showPaymentModal.plot.investors && showPaymentModal.plot.investors.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      Already paid: Rs. {showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Total Amount</label>
                <input
                  type="text"
                  value={`Rs. ${parseFloat(showPaymentModal.inventory.price || 0).toLocaleString()}`}
                  disabled
                />
                {showPaymentModal.plot && showPaymentModal.plot.investors && showPaymentModal.plot.investors.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    <div>Already Paid: Rs. {showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}</div>
                    <div style={{ color: '#dc3545', fontWeight: '500' }}>
                      Remaining: Rs. {(parseFloat(showPaymentModal.inventory.price || 0) - showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0)).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Payment Date *</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  Investors *
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleAddInvestorToPayment}
                    style={{ marginLeft: '1rem', fontSize: '0.875rem', padding: '0.25rem 0.75rem' }}
                  >
                    + Add Investor
                  </button>
                </label>

                {paymentForm.investors.length === 0 ? (
                  <p style={{ color: '#999', fontStyle: 'italic' }}>No investors added. Click "Add Investor" to add one.</p>
                ) : (
                  <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '1rem' }}>
                    {paymentForm.investors.map((inv, index) => {
                      const investor = investors.find(i => i.id === parseInt(inv.investor_id));
                      // Always use the dynamically calculated balance from investorBalances
                      const balance = investor ? getInvestorBalance(investor.id) : null;
                      // Calculate remaining balance: total_invested - used_balance (same as backend)
                      const remainingBalance = balance
                        ? parseFloat(balance.remaining_balance || 0)
                        : (investor ? (parseFloat(investor.total_invested || 0) - parseFloat(investor.paid_amount || 0)) : 0);

                      return (
                        <div key={index} style={{
                          marginBottom: '1rem',
                          padding: '1rem',
                          background: '#f8f9fa',
                          borderRadius: '4px',
                          border: '1px solid #dee2e6'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <strong>Investor #{index + 1}</strong>
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={() => handleRemoveInvestorFromPayment(index)}
                              style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem' }}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '1rem' }}>
                            <div>
                              <label>Select Investor *</label>
                              <select
                                value={inv.investor_id}
                                onChange={(e) => handleInvestorPaymentChange(index, 'investor_id', e.target.value)}
                                required
                              >
                                <option value="">Select Investor</option>
                                {investors.map((investor) => {
                                  const invBalance = getInvestorBalance(investor.id);
                                  // Calculate remaining balance dynamically (same as backend)
                                  const remBalance = invBalance
                                    ? parseFloat(invBalance.remaining_balance || 0)
                                    : (parseFloat(investor.total_invested || 0) - parseFloat(investor.paid_amount || 0));
                                  return (
                                    <option key={investor.id} value={investor.id}>
                                      {investor.name} (Available: Rs. {remBalance.toLocaleString()})
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <div>
                              <label>Amount *</label>
                              <input
                                type="number"
                                step="0.01"
                                value={inv.amount}
                                onChange={(e) => handleInvestorPaymentChange(index, 'amount', e.target.value)}
                                placeholder="0.00"
                                required
                                min="0.01"
                              />
                              {investor && (
                                <small style={{
                                  display: 'block',
                                  marginTop: '0.25rem',
                                  color: parseFloat(inv.amount || 0) > remainingBalance ? '#dc3545' : '#666'
                                }}>
                                  Available: Rs. {remainingBalance.toLocaleString()}
                                  {parseFloat(inv.amount || 0) > remainingBalance && ' (Insufficient balance!)'}
                                </small>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      background: '#e7f3ff',
                      borderRadius: '4px',
                      border: '1px solid #b3d9ff'
                    }}>
                      <strong>Total Payment: </strong>
                      Rs. {paymentForm.investors.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  rows="3"
                  placeholder="Optional notes about this payment"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="premium-btn premium-btn-secondary"
                  onClick={() => {
                    setShowPaymentModal(null);
                    setPaymentForm({
                      inventory_id: null,
                      plot_id: null,
                      investors: [],
                      payment_date: new Date().toISOString().split('T')[0],
                      notes: '',
                    });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="premium-btn premium-btn-primary"
                  disabled={paymentForm.investors.length === 0 || (showPaymentModal.allPlots && showPaymentModal.allPlots.length > 1 && !paymentForm.plot_id)}
                >
                  Submit Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Inventory;

