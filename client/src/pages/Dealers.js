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
      setFormData({ name: '', email: '', password: '' });
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
    return <div className="dealers-loading">Loading salespersons...</div>;
  }

  return (
    <div className="dealers">
      <div className="dealers-header">
        <h1 className="dealers-title">Salespersons</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingDealer(null);
            setFormData({ name: '', email: '', password: '' });
            setShowModal(true);
          }}
        >
          + Add Salesperson
        </button>
      </div>

      <div className="dealers-table-container">
        <table className="dealers-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dealers.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-state">
                  No salespersons found
                </td>
              </tr>
            ) : (
              dealers.map((dealer) => (
                <tr key={dealer.id}>
                  <td>{dealer.name}</td>
                  <td>{dealer.email}</td>
                  <td>{new Date(dealer.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(dealer)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(dealer.id)}
                      >
                        Delete
                      </button>
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
            <h2>{editingDealer ? 'Edit Salesperson' : 'Add Salesperson'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
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
                <label>Email *</label>
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
                <label>{editingDealer ? 'New Password (leave empty to keep current)' : 'Password *'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required={!editingDealer}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingDealer(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingDealer ? 'Update' : 'Create'}
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

