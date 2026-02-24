import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Deals.css';

const Deals = () => {
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [formData, setFormData] = useState({
    customer_id: '',
    inventory_id: '',
    plot_ids: [],
    property_type: 'house',
    original_price: '',
    sale_price: '',
    demand_price: '',
    plot_info: '',
    house_address: '',
    house_info: '',
    sale_price_location: '',
  });
  const [availablePlotsForDeal, setAvailablePlotsForDeal] = useState([]);
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchDeals();
    fetchCustomers();
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      let inventoryData;

      if (isAdmin) {
        // Admin can see all inventory (for plot selection)
        inventoryData = response.data;
      } else {
        // Salespersons see only inventory with assigned plots that are available to sell (assigned or paid, not sold)
        inventoryData = response.data.filter(i => {
          // Must have assigned plots
          const hasAssignedPlots = i.assigned_plots && i.assigned_plots.length > 0;
          // Plots should be assigned or paid (not sold)
          const hasAvailablePlots = hasAssignedPlots && i.assigned_plots.some(plot =>
            plot.status === 'assigned' || plot.status === 'paid'
          );
          return hasAvailablePlots;
        });
      }

      // Use available_quantity from API response
      inventoryData = inventoryData.map(item => ({
        ...item,
        availableQuantity: item.available_quantity || item.quantity
      }));

      setInventory(inventoryData);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchPlotsForInventory = async (inventoryId) => {
    if (!inventoryId) {
      setAvailablePlotsForDeal([]);
      return;
    }
    try {
      const response = await api.get(`/inventory/${inventoryId}/plots`);
      // Filter plots that are assigned to the salesperson (or available for admin)
      let plots = response.data;
      if (!isAdmin && user) {
        plots = plots.filter(plot => plot.assigned_to === user.id && ['assigned', 'paid'].includes(plot.status));
      } else {
        plots = plots.filter(plot => ['assigned', 'paid'].includes(plot.status));
      }
      setAvailablePlotsForDeal(plots);
    } catch (error) {
      console.error('Error fetching plots:', error);
      setAvailablePlotsForDeal([]);
    }
  };

  const fetchDeals = async () => {
    try {
      const response = await api.get('/deals');
      setDeals(response.data);
    } catch (error) {
      console.error('Error fetching deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const handleInventoryChange = async (e) => {
    const selectedInventoryId = e.target.value;

    if (selectedInventoryId) {
      const inventoryIdInt = parseInt(selectedInventoryId);
      const selectedInventory = inventory.find(item => item.id === inventoryIdInt);

      if (selectedInventory) {
        // Fetch plots for this inventory
        await fetchPlotsForInventory(inventoryIdInt);

        // Auto-fill fields based on selected inventory
        setFormData(prev => ({
          ...prev,
          inventory_id: selectedInventoryId,
          plot_ids: [],
          property_type: selectedInventory.category || prev.property_type,
          original_price: selectedInventory.price || prev.original_price,
          plot_info: selectedInventory.category === 'plot' ? selectedInventory.address : prev.plot_info,
          house_address: selectedInventory.category === 'house' ? selectedInventory.address : prev.house_address,
          sale_price_location: selectedInventory.category === 'shop_office' ? selectedInventory.address : prev.sale_price_location,
        }));
      }
    } else {
      // Clear inventory selection
      setFormData(prev => ({
        ...prev,
        inventory_id: '',
        plot_ids: [],
        property_type: 'house',
        original_price: '',
        plot_info: '',
        house_address: '',
        sale_price_location: '',
      }));
      setAvailablePlotsForDeal([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.customer_id) {
      alert('Please select a customer');
      return;
    }

    if (!formData.inventory_id) {
      alert('Please select an inventory item');
      return;
    }

    if (formData.plot_ids.length === 0) {
      alert('Please select a plot');
      return;
    }

    if (!formData.sale_price || formData.sale_price.trim() === '') {
      alert('Please enter a sale price');
      return;
    }

    try {
      // Create payload with only single inventory_id (no inventory_ids array)
      const payload = {
        customer_id: formData.customer_id || null,
        inventory_id: formData.inventory_id || null,
        plot_ids: formData.plot_ids,
        property_type: formData.property_type,
        original_price: formData.original_price || null,
        sale_price: formData.sale_price || null,
        demand_price: formData.demand_price || null,
        plot_info: formData.plot_info || null,
        house_address: formData.house_address || null,
        house_info: formData.house_info || null,
        sale_price_location: formData.sale_price_location || null,
        inventory_quantity_used: 1 // Only one plot per deal
      };

      await api.post('/deals', payload);
      fetchDeals();
      setShowModal(false);
      setFormData({
        customer_id: '',
        inventory_id: '',
        plot_ids: [],
        property_type: 'house',
        original_price: '',
        sale_price: '',
        demand_price: '',
        plot_info: '',
        house_address: '',
        house_info: '',
        sale_price_location: '',
      });
      setAvailablePlotsForDeal([]);
    } catch (error) {
      console.error('Error creating deal:', error);
      alert(error.response?.data?.message || 'Error creating deal');
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    if (window.confirm('Are you sure you want to delete this deal?')) {
      try {
        await api.delete(`/deals/${id}`);
        fetchDeals();
      } catch (error) {
        console.error('Error deleting deal:', error);
        alert('Error deleting deal');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      in_progress: { label: 'In Progress', class: 'status-in-progress' },
      deal_done: { label: 'Deal Done', class: 'status-done' },
      deal_not_done: { label: 'Deal Not Done', class: 'status-not-done' },
    };
    const statusInfo = statusMap[status] || statusMap.in_progress;
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.label}</span>;
  };

  const getPropertyTypeLabel = (type) => {
    const typeMap = {
      house: 'House',
      plot: 'Plot',
      shop_office: 'Shop/Office',
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return <div className="deals-loading">Loading deals...</div>;
  }

  return (
    <div className="deals">
      <div className="deals-header">
        <h1 className="deals-title">Deals</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + New Deal
        </button>
      </div>

      <div className="deals-table-container">
        <table className="deals-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Property Type</th>
              <th>Inventory</th>
              <th>Sale Price</th>
              <th>Profit</th>
              <th>Status</th>
              <th>Salesperson</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty-state">
                  No deals found
                </td>
              </tr>
            ) : (
              deals.map((deal) => (
                <tr key={deal.id}>
                  <td>{deal.id}</td>
                  <td>{deal.customer_name || '-'}</td>
                  <td>{getPropertyTypeLabel(deal.property_type)}</td>
                  <td>
                    {deal.inventory_address
                      ? `${deal.inventory_category || ''} - ${deal.inventory_address.substring(0, 30)}${deal.inventory_address.length > 30 ? '...' : ''}`
                      : '-'}
                  </td>
                  <td>
                    {deal.sale_price
                      ? `$${parseFloat(deal.sale_price).toLocaleString()}`
                      : '-'}
                  </td>
                  <td>
                    {deal.profit
                      ? `$${parseFloat(deal.profit).toLocaleString()}`
                      : '-'}
                  </td>
                  <td>{getStatusBadge(deal.status)}</td>
                  <td>{deal.dealer_name}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-view"
                        onClick={() => navigate(`/deals/${deal.id}`)}
                      >
                        View
                      </button>
                      {isAdmin && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(deal.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Deal</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Customer *</label>
                <select
                  value={formData.customer_id}
                  onChange={(e) =>
                    setFormData({ ...formData, customer_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Select Inventory *</label>
                <select
                  value={formData.inventory_id}
                  onChange={handleInventoryChange}
                  required
                  multiple={false}
                >
                  <option value="">Select Inventory</option>
                  {inventory.map((item) => {
                    const availablePlots = item.assigned_plots?.filter(p =>
                      (p.status === 'assigned' || p.status === 'paid')
                    ) || [];
                    return (
                      <option key={item.id} value={item.id}>
                        {getPropertyTypeLabel(item.category)} - {item.address}
                        (${parseFloat(item.price || 0).toLocaleString()})
                        - Available Plots: {availablePlots.length}
                      </option>
                    );
                  })}
                </select>
              </div>
              {formData.inventory_id && availablePlotsForDeal.length > 0 && (
                <div className="form-group">
                  <label>Select Plot to Use *</label>
                  <select
                    value={formData.plot_ids.length > 0 ? formData.plot_ids[0] : ''}
                    onChange={(e) => {
                      const plotId = e.target.value ? parseInt(e.target.value) : null;
                      setFormData({
                        ...formData,
                        plot_ids: plotId ? [plotId] : []
                      });
                    }}
                    required
                  >
                    <option value="">Select a Plot</option>
                    {availablePlotsForDeal.map((plot) => (
                      <option key={plot.id} value={plot.id}>
                        {plot.plot_number} ({plot.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {formData.inventory_id && availablePlotsForDeal.length === 0 && (
                <div className="form-group">
                  <label>Quantity to Use</label>
                  <input
                    type="number"
                    min="1"
                    max={
                      inventory.find(i => i.id === parseInt(formData.inventory_id))?.availableQuantity || 1
                    }
                    value={formData.inventory_quantity_used}
                    onChange={(e) =>
                      setFormData({ ...formData, inventory_quantity_used: parseInt(e.target.value) || 1 })
                    }
                  />
                  <small>
                    Available: {inventory.find(i => i.id === parseInt(formData.inventory_id))?.availableQuantity || 0}
                  </small>
                  <small style={{ color: '#999', display: 'block', marginTop: '0.5rem' }}>
                    No plots available. Using legacy quantity mode.
                  </small>
                </div>
              )}
              <div className="form-group">
                <label>Property Type *</label>
                <select
                  value={formData.property_type}
                  onChange={(e) =>
                    setFormData({ ...formData, property_type: e.target.value })
                  }
                  required
                >
                  <option value="house">House</option>
                  <option value="plot">Plot</option>
                  <option value="shop_office">Shop/Office</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Original Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.original_price}
                    onChange={(e) =>
                      setFormData({ ...formData, original_price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Sale Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.sale_price}
                    onChange={(e) =>
                      setFormData({ ...formData, sale_price: e.target.value })
                    }
                    required
                    min="0"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Demand Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.demand_price}
                  onChange={(e) =>
                    setFormData({ ...formData, demand_price: e.target.value })
                  }
                />
              </div>
              {formData.property_type === 'plot' && (
                <div className="form-group">
                  <label>Plot Info</label>
                  <textarea
                    value={formData.plot_info}
                    onChange={(e) =>
                      setFormData({ ...formData, plot_info: e.target.value })
                    }
                    rows="3"
                  />
                </div>
              )}
              {formData.property_type === 'house' && (
                <>
                  <div className="form-group">
                    <label>House Address</label>
                    <input
                      type="text"
                      value={formData.house_address}
                      onChange={(e) =>
                        setFormData({ ...formData, house_address: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>House Info</label>
                    <textarea
                      value={formData.house_info}
                      onChange={(e) =>
                        setFormData({ ...formData, house_info: e.target.value })
                      }
                      rows="3"
                    />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Sale Price Location</label>
                <input
                  type="text"
                  value={formData.sale_price_location}
                  onChange={(e) =>
                    setFormData({ ...formData, sale_price_location: e.target.value })
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Deal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Deals;

