import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Inventory.css';

const Inventory = () => {
  const { isAdmin, isAccountant, isEmployee, user } = useAuth();
  const canEdit = isAdmin || isAccountant;
  const [inventory, setInventory] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [managePlotsModal, setManagePlotsModal] = useState(null);
  const [editingPlotId, setEditingPlotId] = useState(null);
  const [plotEditForm, setPlotEditForm] = useState({ plot_number: '', plot_category: 'standard', plot_type: 'R', size: '' });
  const [formData, setFormData] = useState({
    category: 'plot',
    address: '',
    price: '',
    quantity: 1,
    plot_numbers: '',
    plot_type: 'R',
    plot_category: 'standard',
    size: ''
  });
  const [availablePlots, setAvailablePlots] = useState([]);
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

  useEffect(() => {
    fetchInventory();
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
        size: ''
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
    });
    setShowModal(true);
  };

  const fetchPlots = async (inventoryId, availableOnly = false) => {
    try {
      const url = availableOnly
        ? `/inventory/${inventoryId}/plots?available_only=true`
        : `/inventory/${inventoryId}/plots`;
      const response = await api.get(url);
      setAvailablePlots(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching plots:', error);
    }
  };

  const handleUpdatePlot = async (plotId) => {
    try {
      await api.put(`/inventory/plots/${plotId}`, plotEditForm);
      alert('Plot updated successfully');
      setEditingPlotId(null);
      // Refresh plots for the manage modal
      if (managePlotsModal) {
         fetchPlots(managePlotsModal.id);
      }
      // Refresh main inventory list
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

  const getGroupedInventory = (items) => {
    const groups = {};
    items.forEach(item => {
      const key = `${item.category}-${item.address}-${item.price}`;
      if (!groups[key]) {
        groups[key] = {
          ...item,
          ids: [item.id],
          total_quantity: parseInt(item.quantity || 0),
          all_plots: [...(item.plots || []), ...(item.assigned_plots || [])],
          combined_plot_numbers: item.plot_numbers_input || ''
        };
      } else {
        groups[key].ids.push(item.id);
        groups[key].total_quantity += parseInt(item.quantity || 0);
        
        // Merge plots and ensure unique by plot_id or id
        const newPlots = [...(item.plots || []), ...(item.assigned_plots || [])];
        newPlots.forEach(p => {
          if (!groups[key].all_plots.find(ap => (ap.id || ap.plot_id) === (p.id || p.plot_id))) {
            groups[key].all_plots.push(p);
          }
        });

        if (item.plot_numbers_input) {
          groups[key].combined_plot_numbers += (groups[key].combined_plot_numbers ? ', ' : '') + item.plot_numbers_input;
        }
      }
    });
    return Object.values(groups).sort((a, b) => Math.max(...b.ids) - Math.max(...a.ids));
  };

  if (loading) {
    return <div className="inventory-loading">Loading inventory...</div>;
  }

  const groupedInventory = getGroupedInventory(inventory);

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
                setFormData({ category: 'plot', address: '', price: '', plot_numbers: '', quantity: 1 });
                setShowModal(true);
              }}
            >
              + Add New Inventory
            </button>
          )}
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Details</th>
                <th>Address & Plots</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Status</th>
                {canEdit && <th>Assigned To</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
            {groupedInventory.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 11 : 10} className="empty-state">
                  No inventory found
                </td>
              </tr>
            ) : (
              groupedInventory.map((item) => {
                const plots = item.all_plots || [];
                const hasMultiplePlots = plots.length > 1;
                const isGrouped = item.ids.length > 1;

                return (
                  <tr key={item.ids.join('-')}>
                    <td>{item.ids.join(', ')}</td>
                    <td>{getCategoryLabel(item.category)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--primary)' }}>{item.plot_type || 'R'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.plot_category || 'Standard'}</span>
                        <span style={{ fontSize: '0.75rem' }}>{item.size || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{item.address}</span>
                        {plots.length > 0 && (
                          <select
                            className="plot-select"
                            defaultValue=""
                          >
                            <option value="">View Plots ({plots.length})</option>
                            {plots.map((plot) => (
                              <option key={plot.id || plot.plot_id} value={plot.id || plot.plot_id}>
                                {plot.plot_number} - {plot.plot_status || plot.status || 'Unsold'}
                              </option>
                            ))}
                          </select>
                        )}
                        {plots.length === 1 && !isAdmin && (
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>
                            {plots[0].investors && plots[0].investors.length > 0 && (
                              <div style={{ color: 'var(--success)' }}>
                                Investors: {plots[0].investors.map(inv =>
                                  `${inv.investor_name} ($${parseFloat(inv.amount_contributed || 0).toLocaleString()})`
                                ).join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: '700' }}>${parseFloat(item.price || 0).toLocaleString()}</td>
                    <td>{item.total_quantity}</td>
                    <td>{getStatusBadge(item.status, item)}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {item.assigned_to_name && (
                            <span>{item.assigned_to_name}</span>
                          )}
                          {(item.plot_assignments && item.plot_assignments.length > 0) || (item.unassigned_plots && item.unassigned_plots.length > 0) ? (
                            <details style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                              <summary style={{ color: '#007bff', textDecoration: 'underline' }}>
                                Assignments ({item.plot_assignments?.length || 0})
                              </summary>
                              <div style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid #ddd', maxHeight: '150px', overflowY: 'auto' }}>
                                {item.plot_assignments && item.plot_assignments.map((assignee) => (
                                  <div key={assignee.id} style={{ marginBottom: '0.5rem' }}>
                                    <div style={{ fontWeight: '500', fontSize: '0.8125rem' }}>
                                      {assignee.name} ({assignee.plots.length})
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                      {assignee.plots.map(p => p.plot_number).join(', ')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : (
                            !item.assigned_to_name && <span>-</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="action-buttons">
                        {canEdit ? (
                          <>
                            <button
                               className="premium-btn premium-btn-secondary"
                               style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                               onClick={() => {
                                 const editData = {
                                   ...item,
                                   id: item.ids[0],
                                   quantity: item.total_quantity,
                                   plot_numbers_input: item.combined_plot_numbers
                                 };
                                 handleEdit(editData);
                               }}
                             >
                               Edit
                             </button>
                             <button
                               className="premium-btn premium-btn-secondary"
                               style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                               onClick={async () => {
                                 setManagePlotsModal(item);
                                 await fetchPlots(item.ids[0]);
                               }}
                             >
                               Plots
                             </button>
                             <button
                               className="premium-btn premium-btn-danger"
                               style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                               onClick={() => {
                                 if (isGrouped) {
                                   if (window.confirm(`This will delete all ${item.ids.length} records in this group. Continue?`)) {
                                     item.ids.forEach(id => handleDelete(id));
                                   }
                                 } else {
                                   handleDelete(item.id);
                                 }
                               }}
                             >
                               Delete
                             </button>
                          </>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {(item.assigned_to === user?.id || (item.all_plots || []).some(p => p.assigned_to_id === user?.id || p.status === 'available')) && (
                              <>
                                <button
                                  className="btn-primary"
                                  style={{ fontSize: '0.8125rem' }}
                                  onClick={() => handleOpenPaymentModal(item)}
                                >
                                  Pay
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
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
            <h2>{editingItem ? 'Edit Inventory' : 'Add Inventory'}</h2>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                          ` - Paid: $${plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}`
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
                      Already paid: ${showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Total Amount</label>
                <input
                  type="text"
                  value={`$${parseFloat(showPaymentModal.inventory.price || 0).toLocaleString()}`}
                  disabled
                />
                {showPaymentModal.plot && showPaymentModal.plot.investors && showPaymentModal.plot.investors.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    <div>Already Paid: ${showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0).toLocaleString()}</div>
                    <div style={{ color: '#dc3545', fontWeight: '500' }}>
                      Remaining: ${(parseFloat(showPaymentModal.inventory.price || 0) - showPaymentModal.plot.investors.reduce((sum, inv) => sum + parseFloat(inv.amount_contributed || 0), 0)).toLocaleString()}
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
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                                      {investor.name} (Available: ${remBalance.toLocaleString()})
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
                                  Available: ${remainingBalance.toLocaleString()}
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
                      ${paymentForm.investors.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString()}
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

      {/* Manage Plots Modal */}
      {managePlotsModal && (
        <div className="modal-overlay" onClick={() => setManagePlotsModal(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Manage Plots for {managePlotsModal.address}</h2>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }} className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Plot #</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Status</th>
                    {canEdit && <th>Size</th>}
                    {canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {availablePlots.map(plot => (
                    <tr key={plot.id}>
                      {editingPlotId === plot.id ? (
                        <>
                          <td>
                            <input 
                              type="text" 
                              value={plotEditForm.plot_number} 
                              onChange={e => setPlotEditForm({...plotEditForm, plot_number: e.target.value})} 
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              value={plotEditForm.plot_category} 
                              onChange={e => setPlotEditForm({...plotEditForm, plot_category: e.target.value})} 
                              placeholder="Category"
                            />
                          </td>
                          <td>
                            <select 
                              value={plotEditForm.plot_type}
                              onChange={e => setPlotEditForm({...plotEditForm, plot_type: e.target.value})}
                            >
                              <option value="R">Residential (R)</option>
                              <option value="C">Commercial (C)</option>
                            </select>
                          </td>
                          <td>
                            <input 
                              type="text" 
                              value={plotEditForm.size} 
                              onChange={e => setPlotEditForm({...plotEditForm, size: e.target.value})} 
                              placeholder="e.g. 5 Marla"
                            />
                          </td>
                          <td>{plot.status}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="premium-btn premium-btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleUpdatePlot(plot.id)}>Save</button>
                              <button className="premium-btn premium-btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setEditingPlotId(null)}>Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{plot.plot_number}</td>
                          <td>{plot.plot_category?.replace('_', ' ') || 'Standard'}</td>
                          <td>{plot.plot_type || 'R'}</td>
                          <td>{plot.status}</td>
                          {canEdit && <td>{plot.size || '-'}</td>}
                          {canEdit && (
                            <td>
                              <button 
                               className="premium-btn premium-btn-secondary"
                               style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                               onClick={() => {
                                 setEditingPlotId(plot.id);
                                 setPlotEditForm({
                                   plot_number: plot.plot_number || '',
                                   plot_category: plot.plot_category || 'standard',
                                   plot_type: plot.plot_type || 'R',
                                   size: plot.size || ''
                                 });
                               }}
                             >
                               Edit
                             </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{marginTop: '1.5rem'}}>
              <button className="premium-btn premium-btn-secondary" onClick={() => setManagePlotsModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;

