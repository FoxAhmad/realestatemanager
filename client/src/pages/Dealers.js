import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Dealers.css';

const Dealers = () => {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'dealer',
  });

  useEffect(() => {
    fetchDealers();
  }, []);

  const fetchDealers = async () => {
    try {
      const response = await api.get('/dealers');
      setDealers(response.data);
    } catch (error) {
      console.error('Error fetching salespersons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDealer) {
        await api.put(
          `/dealers/${editingDealer.id}`,
          formData
        );
      } else {
        await api.post('/dealers', formData);
      }
      fetchDealers();
      setShowModal(false);
      setEditingDealer(null);
      setFormData({ name: '', email: '', password: '', role: 'dealer' });
    } catch (error) {
      console.error('Error saving salesperson:', error);
      alert(error.response?.data?.message || 'Error saving salesperson');
    }
  };

  const handleEdit = (dealer) => {
    setEditingDealer(dealer);
    setFormData({
      name: dealer.name || '',
      email: dealer.email || '',
      password: '',
      role: dealer.role || 'dealer',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this salesperson?')) {
      try {
        await api.delete(`/dealers/${id}`);
        fetchDealers();
      } catch (error) {
        console.error('Error deleting salesperson:', error);
        alert('Error deleting salesperson');
      }
    }
  };

  if (loading) {
    return <div className="dealers-loading">Connecting to Sales Network...</div>;
  }

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Sales Force</h1>
          <p>Manage your authorized salespersons and their platform access.</p>
        </div>
        <button
          className="premium-btn premium-btn-primary"
          onClick={() => {
            setEditingDealer(null);
            setFormData({ name: '', email: '', password: '', role: 'dealer' });
            setShowModal(true);
          }}
        >
          + Add Salesperson
        </button>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Access Email</th>
                <th>Role</th>
                <th>Onboarding Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dealers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">
                    No salespersons found in the registry
                  </td>
                </tr>
              ) : (
                dealers.map((dealer) => (
                  <tr key={dealer.id}>
                    <td style={{ fontWeight: '700' }}>{dealer.name}</td>
                    <td>{dealer.email}</td>
                    <td>
                      <span className={`premium-badge ${
                        dealer.role === 'admin' ? 'premium-badge-primary' : 
                        dealer.role === 'accountant' ? 'premium-badge-success' : 
                        'premium-badge-warning'
                      }`}>
                        {dealer.role.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(dealer.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleEdit(dealer)}
                        >
                          Edit Profile
                        </button>
                        <button
                          className="premium-btn premium-btn-danger"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleDelete(dealer.id)}
                        >
                          Revoke Access
                        </button>
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingDealer ? 'Update Salesperson Profile' : 'Register New Salesperson'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Legal Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Corporate Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>{editingDealer ? 'Update Password (leave empty to keep current)' : 'Account Password *'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required={!editingDealer}
                />
              </div>
              <div className="form-group">
                <label>Operational Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  required
                >
                  <option value="dealer">Salesperson (Dealer)</option>
                  <option value="accountant">Accountant</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="premium-btn premium-btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingDealer(null);
                  }}
                >
                  Discard
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingDealer ? 'Save Changes' : 'Register Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dealers;
