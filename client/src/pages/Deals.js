import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaFilePdf } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import { buildDealsListPDF } from '../utils/dealsReport';
import './Deals.css';
import { notify, confirmDialog } from '../utils/notify';
import DealsInsights from '../components/charts/DealsInsights';

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
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDealId, setEditingDealId] = useState(null);
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
    fetchPayments();
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

  // Receipts only feed the charts, so a failure here just leaves the collected side empty.
  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments');
      setPayments(response.data);
    } catch (error) {
      console.error('Error fetching payments:', error);
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

  // One flat list of every unassigned, available plot across all listings, so the
  // user picks the plot directly instead of choosing a listing first.
  const availablePlotOptions = inventory
    .flatMap((i) => (i.plots || [])
      .filter((p) => p.plot_status === 'available' && !p.assigned_to_id)
      .map((p) => ({ ...p, item: i })))
    .sort((a, b) =>
      (a.item.project_name || '').localeCompare(b.item.project_name || '') ||
      (a.block || '').localeCompare(b.block || '') ||
      String(a.plot_number).localeCompare(String(b.plot_number), undefined, { numeric: true }));

  const plotOptionLabel = (p) => {
    const where = [p.item.project_name, p.block && `Block ${p.block}`].filter(Boolean).join(' · ');
    const what = [`Plot ${p.plot_number}`, p.size, p.plot_category].filter(Boolean).join(' · ');
    return where ? `${where} — ${what}` : what;
  };

  const handlePlotChange = (e) => {
    const plotId = e.target.value;
    const selected = availablePlotOptions.find((p) => String(p.plot_id) === plotId);
    setFormData({
      ...formData,
      plot_id: plotId,
      inventory_id: selected ? selected.item.id : '',
      property_type: selected ? selected.item.category : '',
      original_price: selected ? selected.item.price : '',
      sale_price: selected ? selected.item.price : '', // Default sale price to base price
    });
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

  const emptyFormData = {
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
  };

  const closeDealModal = () => {
    setShowModal(false);
    setEditingDealId(null);
    setFormData(emptyFormData);
    setCustomerInput('');
    setDealerInput('');
  };

  const handleEditDeal = (deal) => {
    setEditingDealId(deal.id);
    setCustomerInput(deal.customer_name || '');
    setDealerInput(deal.dealer_name || '');
    setFormData({
      ...emptyFormData,
      inventory_id: deal.inventory_id || '',
      property_type: deal.property_type || '',
      original_price: deal.original_price || '',
      sale_price: deal.sale_price || '',
      demand_price: deal.demand_price || '',
    });
    setShowModal(true);
  };

  const handleDeleteDeal = async (id) => {
    if (!await confirmDialog('Delete this deal? Its payments and adjustments will be removed too, and the plot will become available again.')) return;
    try {
      await api.delete(`/deals/${id}`);
      fetchDeals();
      fetchPayments();
    } catch (error) {
      console.error('Error deleting deal:', error);
      notify(error.response?.data?.message || 'Error deleting deal');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dealerName = dealerInput.trim();
      if (!dealerName) {
        notify('Salesperson name is required');
        return;
      }
      const dealerId = await resolveDealerId();
      const customerId = await resolveCustomerId();
      if (!customerId) {
        notify('Customer name is required');
        return;
      }

      if (editingDealId) {
        await api.put(`/deals/${editingDealId}`, {
          customer_id: customerId,
          dealer_id: dealerId,
          property_type: formData.property_type,
          original_price: formData.original_price,
          sale_price: formData.sale_price,
          demand_price: formData.demand_price,
        });
      } else {
        await api.post('/deals', { ...formData, customer_id: customerId, dealer_id: dealerId });
      }
      fetchDeals();
      fetchPayments();
      closeDealModal();
    } catch (error) {
      console.error('Error saving deal:', error);
      notify(error.response?.data?.message || 'Error saving deal');
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

  const handleExportDeals = () => {
    try {
      buildDealsListPDF({ deals: filteredDeals, preparedBy: user?.name });
    } catch (error) {
      console.error('Error exporting deals PDF:', error);
      notify('Error generating PDF export');
    }
  };

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Real Estate Deals</h1>
          <p>Monitor your sales pipeline and manage property transactions.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="premium-btn premium-btn-secondary" onClick={handleExportDeals}>
            <FaFilePdf /> Export PDF
          </button>
          {(isAdmin || isAccountant) && (
            <button
              className="premium-btn premium-btn-primary"
              onClick={() => { setEditingDealId(null); setShowModal(true); }}
            >
              + Create New Deal
            </button>
          )}
        </div>
      </div>

      <DealsInsights deals={filteredDeals} payments={payments} />

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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '110px' }}>
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => navigate(`/deals/${deal.id}`)}
                        >
                          View Profile
                        </button>
                        {(isAdmin || isAccountant) && (
                          <button
                            className="premium-btn premium-btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            onClick={() => handleEditDeal(deal)}
                          >
                            Edit Deal
                          </button>
                        )}
                        {(isAdmin || isAccountant) && (
                          <button
                            className="premium-btn premium-btn-danger"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            onClick={() => handleDeleteDeal(deal.id)}
                          >
                            Delete Deal
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
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeDealModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingDealId ? 'Edit Deal' : 'Initiate New Property Deal'}</h2>
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

              {editingDealId ? (
                <div className="form-group">
                  <label>Inventory Asset / Plot</label>
                  <input type="text" value={inventory.find((i) => i.id === formData.inventory_id)?.address || 'Unchanged'} disabled />
                  <small style={{ color: '#666', display: 'block', marginTop: '0.35rem' }}>
                    The assigned plot isn't editable here - delete and recreate the deal to reassign it.
                  </small>
                </div>
              ) : (
                <div className="form-group">
                  <label>Plot *</label>
                  <select value={formData.plot_id} onChange={handlePlotChange} required>
                    <option value="">Choose plot...</option>
                    {availablePlotOptions.map((p) => (
                      <option key={p.plot_id} value={p.plot_id}>{plotOptionLabel(p)}</option>
                    ))}
                  </select>
                  <small style={{ color: '#666', display: 'block', marginTop: '0.35rem' }}>
                    Only unsold plots are listed. Choosing one fills in the type and price below.
                  </small>
                </div>
              )}

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
                  onClick={closeDealModal}
                >
                  Discard
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingDealId ? 'Update Deal' : 'Finalize Deal'}
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
