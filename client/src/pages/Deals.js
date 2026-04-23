import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Deals.css';

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
    total_amount: '',
    booking_amount: '',
    installments: '',
    notes: '',
  });

  const [availablePlots, setAvailablePlots] = useState([]);

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
    setFormData({ ...formData, inventory_id: inventoryId, plot_id: '' });
    if (inventoryId) {
      fetchPlots(inventoryId);
    } else {
      setAvailablePlots([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/deals', formData);
      fetchDeals();
      setShowModal(false);
      setFormData({
        customer_id: '',
        dealer_id: '',
        inventory_id: '',
        plot_id: '',
        total_amount: '',
        booking_amount: '',
        installments: '',
        notes: '',
      });
    } catch (error) {
      console.error('Error creating deal:', error);
      alert(error.response?.data?.message || 'Error creating deal');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'in_progress': <span className="premium-badge premium-badge-warning">In Progress</span>,
      'done': <span className="premium-badge premium-badge-success">Completed</span>,
      'not_done': <span className="premium-badge premium-badge-danger">Pending</span>,
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
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Deal ID</th>
                <th>Customer Name</th>
                <th>Salesperson</th>
                <th>Asset Details</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No active deals recorded in current pipeline
                  </td>
                </tr>
              ) : (
                deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>#{deal.id}</td>
                    <td style={{ fontWeight: '700' }}>{deal.customer_name}</td>
                    <td>{deal.dealer_name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{deal.inventory_address}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {deal.plot_number ? `Plot: ${deal.plot_number}` : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: '700' }}>${parseFloat(deal.total_amount).toLocaleString()}</td>
                    <td>{getStatusBadge(deal.status)}</td>
                    <td>
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
                <label>Select Customer *</label>
                <select
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  required
                >
                  <option value="">Choose a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} - {c.cnic}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Assigned Salesperson *</label>
                <select
                  value={formData.dealer_id}
                  onChange={(e) => setFormData({ ...formData, dealer_id: e.target.value })}
                  required
                >
                  <option value="">Choose a salesperson...</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
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

              <div className="form-row">
                <div className="form-group">
                  <label>Total Deal Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.total_amount}
                    onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Booking Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.booking_amount}
                    onChange={(e) => setFormData({ ...formData, booking_amount: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Number of Installments</label>
                <input
                  type="number"
                  value={formData.installments}
                  onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                />
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
                  onClick={() => setShowModal(false)}
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
