import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './Deals.css';

const DEAL_STATUS_LABELS = {
  in_progress: 'In Progress',
  deal_done: 'Completed',
  deal_not_done: 'Cancelled',
};

const DEAL_COLUMNS = [
  { key: 'id', label: 'Deal ID', type: 'number' },
  { key: 'customer_name', label: 'Customer Name', type: 'text' },
  { key: 'dealer_name', label: 'Salesperson', type: 'text' },
  {
    key: 'asset_details',
    label: 'Asset Details',
    type: 'text',
    accessor: (row) => [row.inventory_address, row.plot_number, row.property_type].filter(Boolean).join(' '),
  },
  { key: 'original_price', label: 'Base Price', type: 'currency' },
  { key: 'sale_price', label: 'Sale Price', type: 'currency' },
  { key: 'status', label: 'Status', type: 'enum', formatOption: (v) => DEAL_STATUS_LABELS[v] || v },
];

const Deals = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isAccountant } = useAuth();
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: '',
    dealer_id: '',
    inventory_id: '',
    plot_id: '',
    property_type: '',
    original_price: '',
    sale_price: '',
    demand_price: '',
    installments: '',
    notes: '',
  });

  const [availablePlots, setAvailablePlots] = useState([]);
  const [customerInput, setCustomerInput] = useState('');
  const [dealerInput, setDealerInput] = useState('');

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredDeals,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(deals, DEAL_COLUMNS);

  useEffect(() => {
    fetchDeals();
    fetchCustomers();
    fetchDealers();
    fetchInventory();
  }, []);

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

  const fetchDealers = async () => {
    try {
      const response = await api.get('/dealers');
      setDealers(response.data);
    } catch (error) {
      console.error('Error fetching dealers:', error);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      setInventory(response.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchPlots = async (inventoryId) => {
    try {
      const response = await api.get(`/inventory/${inventoryId}/plots?available_only=true`);
      setAvailablePlots(response.data);
    } catch (error) {
      console.error('Error fetching plots:', error);
    }
  };

  const handleInventoryChange = (e) => {
    const inventoryId = e.target.value;
    const selectedInventory = inventory.find(i => i.id === parseInt(inventoryId));
    
    setFormData({ 
      ...formData, 
      inventory_id: inventoryId, 
      plot_id: '',
      property_type: selectedInventory ? selectedInventory.category : '',
      original_price: selectedInventory ? selectedInventory.price : '',
      sale_price: selectedInventory ? selectedInventory.price : '', // Default sale price to base price
    });
    
    if (inventoryId) {
      fetchPlots(inventoryId);
    } else {
      setAvailablePlots([]);
    }
  };

  const resolveCustomerId = async () => {
    const name = customerInput.trim();
    if (!name) return null;
    const existing = customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const response = await api.post('/customers', { name });
    setCustomers((prev) => [...prev, response.data]);
    return response.data.id;
  };

  const resolveDealerId = async () => {
    const name = dealerInput.trim();
    if (!name) return null;
    const existing = dealers.find((d) => d.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;

    // No existing salesperson matches this name - create one on the fly so the
    // typed name doesn't have to match a pre-registered account.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'salesperson';
    const email = `${slug}.${Date.now()}@placeholder.local`;
    const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const response = await api.post('/dealers', { name, email, password });
    setDealers((prev) => [...prev, response.data]);
    return response.data.id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dealerName = dealerInput.trim();
      if (!dealerName) {
        alert('Salesperson name is required');
        return;
      }
      const dealerId = await resolveDealerId();
      const customerId = await resolveCustomerId();
      if (!customerId) {
        alert('Customer name is required');
        return;
      }

      await api.post('/deals', { ...formData, customer_id: customerId, dealer_id: dealerId });
      fetchDeals();
      setShowModal(false);
      setFormData({
        customer_id: '',
        dealer_id: '',
        inventory_id: '',
        plot_id: '',
        property_type: '',
        original_price: '',
        sale_price: '',
        demand_price: '',
        installments: '',
        notes: '',
      });
      setCustomerInput('');
      setDealerInput('');
    } catch (error) {
      console.error('Error creating deal:', error);
      alert(error.response?.data?.message || 'Error creating deal');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'in_progress': <span className="premium-badge premium-badge-warning">In Progress</span>,
      'deal_done': <span className="premium-badge premium-badge-success">Completed</span>,
      'deal_not_done': <span className="premium-badge premium-badge-danger">Cancelled</span>,
    };
    return badges[status] || <span className="premium-badge premium-badge-neutral">{status}</span>;
  };

  if (loading) {
    return <div className="deals-loading">Accessing Deal Registry...</div>;
  }

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Real Estate Deals</h1>
          <p>Monitor your sales pipeline and manage property transactions.</p>
        </div>
        {(isAdmin || isAccountant) && (
          <button
            className="premium-btn premium-btn-primary"
            onClick={() => setShowModal(true)}
          >
            + Create New Deal
          </button>
        )}
      </div>

      <div className="glass-card">
        <TableToolbar
          columns={DEAL_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search deals by customer, salesperson, asset..."
          resultCount={filteredDeals.length}
        />
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Deal ID</th>
                <th>Customer Name</th>
                <th>Salesperson</th>
                <th>Asset Details</th>
                <th>Base Price</th>
                <th>Sale Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No active deals match the current search/filter criteria
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => (
                  <tr key={deal.id}>
                    <td data-label="Deal ID">#{deal.id}</td>
                    <td data-label="Customer Name" style={{ fontWeight: '700' }}>{deal.customer_name}</td>
                    <td data-label="Salesperson">{deal.dealer_name}</td>
                    <td data-label="Asset Details">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{deal.inventory_address}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {deal.plot_number ? `Plot: ${deal.plot_number}` : 'N/A'}
                        </span>
                        <span className="premium-badge premium-badge-neutral" style={{ fontSize: '0.7rem', marginTop: '0.2rem', alignSelf: 'flex-start' }}>
                          {deal.property_type?.replace('_', ' ')}
                        </span>
                      </div>
                    </td>
                    <td data-label="Base Price" style={{ color: 'var(--text-muted)' }}>Rs. {parseFloat(deal.original_price || 0).toLocaleString()}</td>
                    <td data-label="Sale Price" style={{ fontWeight: '700' }}>Rs. {parseFloat(deal.sale_price || 0).toLocaleString()}</td>
                    <td data-label="Status">{getStatusBadge(deal.status)}</td>
                    <td data-label="Actions">
                      <button
                        className="premium-btn premium-btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => navigate(`/deals/${deal.id}`)}
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Initiate New Property Deal</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Customer *</label>
                <input
                  type="text"
                  list="deal-customer-names"
                  value={customerInput}
                  onChange={(e) => setCustomerInput(e.target.value)}
                  placeholder="Type or select a customer name"
                  required
                />
                <datalist id="deal-customer-names">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <small style={{ color: '#666', display: 'block', marginTop: '0.35rem' }}>
                  Pick an existing customer, or type a new name to create one.
                </small>
              </div>

              <div className="form-group">
                <label>Salesperson *</label>
                <input
                  type="text"
                  list="deal-dealer-names"
                  value={dealerInput}
                  onChange={(e) => setDealerInput(e.target.value)}
                  placeholder="Type or select a salesperson name"
                  required
                />
                <datalist id="deal-dealer-names">
                  {dealers.map((d) => (
                    <option key={d.id} value={d.name} />
                  ))}
                </datalist>
                <small style={{ color: '#666', display: 'block', marginTop: '0.35rem' }}>
                  Pick an existing salesperson, or type a new name to add one.
                </small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Inventory Asset *</label>
                  <select
                    value={formData.inventory_id}
                    onChange={handleInventoryChange}
                    required
                  >
                    <option value="">Choose asset...</option>
                    {inventory.map((i) => (
                      <option key={i.id} value={i.id}>{i.category} - {i.address}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Plot Number *</label>
                  <select
                    value={formData.plot_id}
                    onChange={(e) => setFormData({ ...formData, plot_id: e.target.value })}
                    required
                  >
                    <option value="">Choose plot...</option>
                    {availablePlots.map((p) => (
                      <option key={p.id} value={p.id}>{p.plot_number} ({p.plot_category})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Property Type *</label>
                <select
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  required
                >
                  <option value="">Select type...</option>
                  <option value="plot">Plot</option>
                  <option value="house">House</option>
                  <option value="shop_office">Shop/Office</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Base Price (Original) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.original_price}
                    onChange={(e) => setFormData({ ...formData, original_price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Sale Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.sale_price}
                    onChange={(e) => setFormData({ ...formData, sale_price: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Demand Price (Target)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.demand_price}
                    onChange={(e) => setFormData({ ...formData, demand_price: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Installments</label>
                  <input
                    type="number"
                    value={formData.installments}
                    onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Special Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="premium-btn premium-btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setCustomerInput('');
                    setDealerInput('');
                  }}
                >
                  Discard
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  Finalize Deal
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
