import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Inventory.css';

const Inventory = () => {
  const { isAdmin, user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [formData, setFormData] = useState({
    category: 'plot',
    address: '',
    price: '',
    quantity: 1,
    plot_numbers: '',
  });
  const [availablePlots, setAvailablePlots] = useState([]);
  const [selectedPlots, setSelectedPlots] = useState([]);
  const [assignmentPayment, setAssignmentPayment] = useState({
    amount_paid: '',
    notes: '',
  });
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestInventory, setRequestInventory] = useState(null);
  const [availableInventoryForRequest, setAvailableInventoryForRequest] = useState([]);
  const [selectedPlotsForRequest, setSelectedPlotsForRequest] = useState([]);
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
    if (isAdmin) {
      fetchSalespersons();
      // Admins can also assign to themselves and pay, so fetch investors
      fetchInvestors();
      if (user) {
        fetchInvestorBalances();
      }
    } else {
      // For salespersons, also fetch available inventory for requests
      fetchAvailableInventoryForRequest();
      fetchInvestors();
      if (user) {
        fetchInvestorBalances();
      }
    }
  }, [user]);

  const fetchAvailableInventoryForRequest = async () => {
    try {
      // Use the dedicated endpoint for available inventory
      const response = await api.get('/inventory/available');
      setAvailableInventoryForRequest(response.data);
    } catch (error) {
      console.error('Error fetching available inventory:', error);
    }
  };

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
          formData
        );
      } else {
        await api.post('/inventory', formData);
      }
      fetchInventory();
      setShowModal(false);
      setEditingItem(null);
      setFormData({ category: 'plot', address: '', price: '', quantity: 1, plot_numbers: '' });
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
    } catch (error) {
      console.error('Error fetching plots:', error);
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

  const handleAssign = async (salespersonId) => {
    try {
      if (selectedPlots.length === 0) {
        alert('Please select at least one plot to assign');
        return;
      }

      const payload = {
        salesperson_id: salespersonId,
        plot_ids: selectedPlots,
        amount_paid: assignmentPayment.amount_paid || 0,
        notes: assignmentPayment.notes || '',
      };

      const response = await api.post(
        `/inventory/${assignModal.id}/assign`,
        payload
      );

      alert(`Successfully assigned ${response.data.plots_assigned} plot(s). Total amount: $${response.data.total_amount.toLocaleString()}, Paid: $${response.data.amount_paid.toLocaleString()}`);

      fetchInventory();
      setAssignModal(null);
      setSelectedPlots([]);
      setAssignmentPayment({ amount_paid: '', notes: '' });
    } catch (error) {
      console.error('Error assigning inventory:', error);
      alert(error.response?.data?.message || 'Error assigning inventory');
    }
  };

  const handleOpenAssignModal = async (item) => {
    setAssignModal(item);
    setSelectedPlots([]);
    setAssignmentPayment({ amount_paid: '', notes: '' });
    await fetchPlots(item.id);
  };

  const handleOpenRequestModal = async (inventoryItem) => {
    setRequestInventory(inventoryItem);
    setSelectedPlotsForRequest([]);
    // If the inventory item already has available_plots from the API, use those
    // Otherwise, fetch only available plots
    if (inventoryItem.available_plots && inventoryItem.available_plots.length > 0) {
      setAvailablePlots(inventoryItem.available_plots);
    } else {
      await fetchPlots(inventoryItem.id, true); // true = availableOnly
    }
  };

  const handleRequest = async () => {
    if (!requestInventory) return;

    try {
      const payload = {
        inventory_id: requestInventory.id,
      };

      // If plots are available and selected, include plot_ids
      if (selectedPlotsForRequest.length > 0) {
        payload.plot_ids = selectedPlotsForRequest;
      }

      const response = await api.post(
        '/inventory-requests',
        payload
      );

      alert('Inventory request submitted successfully. Admin will review and approve.');
      fetchInventory();
      fetchAvailableInventoryForRequest();
      setShowRequestModal(false);
      setRequestInventory(null);
      setSelectedPlotsForRequest([]);
    } catch (error) {
      console.error('Error requesting inventory:', error);
      alert(error.response?.data?.message || 'Error requesting inventory');
    }
  };

  const getStatusBadge = (status, item = null) => {


    // If item has plot assignments, show partial status if applicable
    if (item && item.plot_assignments && item.plot_assignments.length > 0) {
      const totalPlots = (item.plot_assignments.reduce((sum, a) => sum + a.plots.length, 0) || 0) + (item.unassigned_plots?.length || 0);
      const assignedPlots = item.plot_assignments.reduce((sum, a) => sum + a.plots.length, 0);

      if (assignedPlots > 0 && assignedPlots < totalPlots) {
        return <span className="badge badge-warning">Partially Assigned</span>;
      }
    }

    const badges = {
      available: <span className="badge badge-success">Available</span>,
      assigned: <span className="badge badge-warning">Assigned</span>,
      paid: <span className="badge badge-info">Paid</span>,
      sold: <span className="badge badge-primary">Sold</span>,
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

  if (loading) {
    return <div className="inventory-loading">Loading inventory...</div>;
  }

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1 className="inventory-title">Inventory</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {!isAdmin && (
            <button
              className="btn-request"
              onClick={() => setShowRequestModal(true)}
            >
              + Request Inventory
            </button>
          )}
          {isAdmin && (
            <button
              className="btn-primary"
              onClick={() => {
                setEditingItem(null);
                setFormData({ category: 'plot', address: '', price: '', plot_numbers: '', quantity: 1 });
                setShowModal(true);
              }}
            >
              + Add Inventory
            </button>
          )}
        </div>
      </div>

      <div className="inventory-table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Category</th>
              <th>Address</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Status</th>
              {isAdmin && <th>Assigned To</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="empty-state">
                  No inventory found
                </td>
              </tr>
            ) : (
              inventory.map((item) => {
                const assignedPlots = item.assigned_plots || [];
                const hasMultiplePlots = assignedPlots.length > 1;

                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{getCategoryLabel(item.category)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span>{item.address}</span>
                        {!isAdmin && hasMultiplePlots && (
                          <select
                            style={{
                              fontSize: '0.875rem',
                              padding: '0.25rem 0.5rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              maxWidth: '200px',
                              marginTop: '0.25rem'
                            }}
                            onChange={(e) => {
                              // Optional: handle plot selection if needed
                            }}
                          >
                            <option value="">All Plots ({assignedPlots.length})</option>
                            {assignedPlots.map((plot) => (
                              <option key={plot.id} value={plot.id}>
                                {plot.plot_number} ({plot.status})
                              </option>
                            ))}
                          </select>
                        )}
                        {!isAdmin && assignedPlots.length === 1 && (
                          <>
                            <span style={{ fontSize: '0.875rem', color: '#666' }}>
                              Plot: {assignedPlots[0].plot_number}
                            </span>
                            {assignedPlots[0].investors && assignedPlots[0].investors.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#28a745', marginTop: '0.25rem' }}>
                                Investors: {assignedPlots[0].investors.map(inv =>
                                  `${inv.investor_name} ($${parseFloat(inv.amount_contributed || 0).toLocaleString()})`
                                ).join(', ')}
                              </div>
                            )}
                          </>
                        )}
                        {!isAdmin && hasMultiplePlots && assignedPlots.some(p => p.investors && p.investors.length > 0) && (
                          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                            <details style={{ cursor: 'pointer' }}>
                              <summary>View Investors by Plot</summary>
                              <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
                                {assignedPlots.filter(p => p.investors && p.investors.length > 0).map(plot => (
                                  <div key={plot.id} style={{ marginBottom: '0.5rem' }}>
                                    <strong>{plot.plot_number}:</strong> {plot.investors.map(inv =>
                                      `${inv.investor_name} ($${parseFloat(inv.amount_contributed || 0).toLocaleString()})`
                                    ).join(', ')}
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>${parseFloat(item.price || 0).toLocaleString()}</td>
                    <td>{assignedPlots.length > 0 ? assignedPlots.length : (item.quantity || 1)}</td>
                    <td>{getStatusBadge(item.status, item)}</td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {item.assigned_to_name && (
                            <span>{item.assigned_to_name}</span>
                          )}
                          {(item.plot_assignments && item.plot_assignments.length > 0) || (item.unassigned_plots && item.unassigned_plots.length > 0) ? (
                            <details style={{ cursor: 'pointer', fontSize: '0.875rem' }}>
                              <summary style={{ color: '#007bff', textDecoration: 'underline' }}>
                                View Plot Assignments ({item.plot_assignments?.length || 0} assignee{item.plot_assignments?.length !== 1 ? 's' : ''})
                              </summary>
                              <div style={{ marginTop: '0.5rem', paddingLeft: '1rem', borderLeft: '2px solid #ddd' }}>
                                {item.plot_assignments && item.plot_assignments.map((assignee) => (
                                  <div key={assignee.id} style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '0.25rem' }}>
                                      {assignee.name} ({assignee.plots.length} plot{assignee.plots.length !== 1 ? 's' : ''})
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#666', marginLeft: '0.5rem' }}>
                                      Plots: {assignee.plots.map(p => p.plot_number).join(', ')}
                                    </div>
                                  </div>
                                ))}
                                {item.unassigned_plots && item.unassigned_plots.length > 0 && (
                                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
                                    <div style={{ fontWeight: 'bold', color: '#999', marginBottom: '0.25rem' }}>
                                      Unassigned ({item.unassigned_plots.length} plot{item.unassigned_plots.length !== 1 ? 's' : ''})
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#999', marginLeft: '0.5rem' }}>
                                      {item.unassigned_plots.map(p => p.plot_number).join(', ')}
                                    </div>
                                  </div>
                                )}
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
                        {isAdmin ? (
                          <>
                            {/* Show "Assigned to You" and Pay button if admin has assigned plots */}
                            {(item.assigned_to === user?.id || assignedPlots.length > 0) && (
                              <>
                                <span className="badge badge-info" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginRight: '0.5rem' }}>
                                  Assigned to You
                                </span>
                                {/* Only show Pay button if not all plots are paid */}
                                {assignedPlots.length > 0 && !assignedPlots.every(plot => plot.status === 'paid') && (
                                  <button
                                    className="btn-primary"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginRight: '0.5rem' }}
                                    onClick={() => handleOpenPaymentModal(item)}
                                    title="Pay for this inventory"
                                  >
                                    Pay
                                  </button>
                                )}
                                {/* Show Paid badge if all plots are paid */}
                                {assignedPlots.length > 0 && assignedPlots.every(plot => plot.status === 'paid') && (
                                  <span className="badge badge-info" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginRight: '0.5rem', backgroundColor: '#28a745', color: 'white' }}>
                                    All Paid
                                  </span>
                                )}
                              </>
                            )}
                            <button
                              className="btn-edit"
                              onClick={() => handleEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-assign"
                              onClick={() => handleOpenAssignModal(item)}
                            >
                              Assign
                            </button>
                            <button
                              className="btn-delete"
                              onClick={() => handleDelete(item.id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            {(item.assigned_to === user?.id || assignedPlots.length > 0) && (
                              <>
                                <span className="badge badge-info" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginRight: '0.5rem' }}>
                                  Assigned to You
                                </span>
                                {/* Only show Pay button if not all plots are paid */}
                                {assignedPlots.length > 0 && !assignedPlots.every(plot => plot.status === 'paid') && (
                                  <button
                                    className="btn-primary"
                                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                                    onClick={() => handleOpenPaymentModal(item)}
                                    title="Pay for this inventory"
                                  >
                                    Pay
                                  </button>
                                )}
                                {/* Show Paid badge if all plots are paid */}
                                {assignedPlots.length > 0 && assignedPlots.every(plot => plot.status === 'paid') && (
                                  <span className="badge badge-info" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white' }}>
                                    All Paid
                                  </span>
                                )}
                              </>
                            )}
                          </>
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingItem(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setAssignModal(null);
            setSelectedPlots([]);
            setAssignmentPayment({ amount_paid: '', notes: '' });
          }}
        >
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Assign Inventory to Salesperson</h2>
            <p>
              <strong>Item:</strong> {getCategoryLabel(assignModal.category)} -{' '}
              {assignModal.address}
            </p>
            <p>
              <strong>Price per plot:</strong> ${parseFloat(assignModal.price || 0).toLocaleString()}
            </p>

            {availablePlots.length > 0 ? (
              <>
                <div className="form-group">
                  <label>Select Plots to Assign *</label>
                  <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', padding: '1rem', borderRadius: '4px' }}>
                    {availablePlots
                      .filter(plot => plot.status === 'available')
                      .map((plot) => (
                        <div key={plot.id} style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedPlots.includes(plot.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPlots([...selectedPlots, plot.id]);
                                } else {
                                  setSelectedPlots(selectedPlots.filter(id => id !== plot.id));
                                }
                              }}
                              style={{ marginRight: '0.5rem' }}
                            />
                            <span>
                              {plot.plot_number} - {plot.status}
                              {plot.assigned_to_name && ` (Assigned to: ${plot.assigned_to_name})`}
                            </span>
                          </label>
                        </div>
                      ))}
                  </div>
                  {availablePlots.filter(plot => plot.status === 'available').length === 0 && (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No available plots</p>
                  )}
                </div>

                {selectedPlots.length > 0 && (
                  <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                    <p><strong>Selected:</strong> {selectedPlots.length} plot(s)</p>
                    <p><strong>Total Amount:</strong> ${(selectedPlots.length * parseFloat(assignModal.price || 0)).toLocaleString()}</p>
                  </div>
                )}

                <div className="form-group">
                  <label>Amount Paid</label>
                  <input
                    type="number"
                    step="0.01"
                    value={assignmentPayment.amount_paid}
                    onChange={(e) =>
                      setAssignmentPayment({ ...assignmentPayment, amount_paid: e.target.value })
                    }
                    placeholder="0.00"
                  />
                  <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                    Can be partial payment. Remaining balance will be tracked.
                  </small>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={assignmentPayment.notes}
                    onChange={(e) =>
                      setAssignmentPayment({ ...assignmentPayment, notes: e.target.value })
                    }
                    rows="3"
                    placeholder="Optional notes about this assignment"
                  />
                </div>
              </>
            ) : (
              <p style={{ color: '#999', fontStyle: 'italic' }}>Loading plots...</p>
            )}

            <div className="form-group">
              <label>Select Salesperson *</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssign(parseInt(e.target.value));
                  }
                }}
              >
                <option value="">Select a salesperson</option>
                {/* Include admin themselves in the list */}
                {isAdmin && user && (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email}) - Admin
                  </option>
                )}
                {salespersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} ({sp.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAssignModal(null);
                  setSelectedPlots([]);
                  setAssignmentPayment({ amount_paid: '', notes: '' });
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Inventory Modal for Salespersons */}
      {showRequestModal && !isAdmin && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowRequestModal(false);
            setRequestInventory(null);
            setSelectedPlotsForRequest([]);
          }}
        >
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Request Inventory</h2>

            <div className="form-group">
              <label>Select Inventory to Request *</label>
              <select
                value={requestInventory?.id || ''}
                onChange={async (e) => {
                  const selectedId = e.target.value;
                  if (selectedId) {
                    const selected = availableInventoryForRequest.find(i => i.id === parseInt(selectedId));
                    if (selected) {
                      await handleOpenRequestModal(selected);
                    }
                  } else {
                    setRequestInventory(null);
                    setSelectedPlotsForRequest([]);
                    setAvailablePlots([]);
                  }
                }}
                required
              >
                <option value="">Select Inventory</option>
                {availableInventoryForRequest.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getCategoryLabel(item.category)} - {item.address}
                    (${parseFloat(item.price || 0).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            {requestInventory && availablePlots.length > 0 && (
              <>
                <div className="form-group">
                  <label>Select Plots to Request (Optional)</label>
                  <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', padding: '1rem', borderRadius: '4px' }}>
                    {availablePlots
                      .filter(plot => plot.status === 'available')
                      .map((plot) => (
                        <div key={plot.id} style={{ marginBottom: '0.5rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedPlotsForRequest.includes(plot.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPlotsForRequest([...selectedPlotsForRequest, plot.id]);
                                } else {
                                  setSelectedPlotsForRequest(selectedPlotsForRequest.filter(id => id !== plot.id));
                                }
                              }}
                              style={{ marginRight: '0.5rem' }}
                            />
                            <span>
                              {plot.plot_number} - {plot.status}
                            </span>
                          </label>
                        </div>
                      ))}
                  </div>
                  {availablePlots.filter(plot => plot.status === 'available').length === 0 && (
                    <p style={{ color: '#999', fontStyle: 'italic' }}>No available plots</p>
                  )}
                  <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                    Leave unselected to request entire inventory
                  </small>
                </div>

                {selectedPlotsForRequest.length > 0 && (
                  <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                    <p><strong>Selected:</strong> {selectedPlotsForRequest.length} plot(s)</p>
                    <p><strong>Total Amount:</strong> ${(selectedPlotsForRequest.length * parseFloat(requestInventory.price || 0)).toLocaleString()}</p>
                  </div>
                )}
              </>
            )}

            {requestInventory && availablePlots.length === 0 && (
              <p style={{ color: '#999', fontStyle: 'italic' }}>Loading plots...</p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowRequestModal(false);
                  setRequestInventory(null);
                  setSelectedPlotsForRequest([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-request"
                onClick={handleRequest}
                disabled={!requestInventory}
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal for Salespersons */}
      {showPaymentModal && !isAdmin && (
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
                  className="btn-secondary"
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
                  className="btn-primary"
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

