import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Customers.css';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    cnic: '',
    phone_number: '',
    email: '',
    address: '',
    status: 'potential',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.put(
          `/customers/${editingCustomer.id}`,
          formData
        );
      } else {
        await api.post('/customers', formData);
      }
      fetchCustomers();
      setShowModal(false);
      setEditingCustomer(null);
      setFormData({ name: '', cnic: '', phone_number: '', email: '', address: '', status: 'potential' });
    } catch (error) {
      console.error('Error saving customer:', error);
      alert(error.response?.data?.message || 'Error saving customer');
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      cnic: customer.cnic || '',
      phone_number: customer.phone_number || '',
      email: customer.email || '',
      address: customer.address || '',
      status: customer.status || 'potential',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await api.delete(`/customers/${id}`);
        fetchCustomers();
      } catch (error) {
        console.error('Error deleting customer:', error);
        alert('Error deleting customer');
      }
    }
  };

  if (loading) {
    return <div className="customers-loading">Loading Command Center...</div>;
  }

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Customer Management</h1>
          <p>Maintain your database of walk-in and converted customers.</p>
        </div>
        <button
          className="premium-btn premium-btn-primary"
          onClick={() => {
            setEditingCustomer(null);
            setFormData({ name: '', cnic: '', phone_number: '', email: '', address: '', status: 'potential' });
            setShowModal(true);
          }}
        >
          + Add New Customer
        </button>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Identity (CNIC)</th>
                <th>Contact Details</th>
                <th>Address</th>
                <th>Status</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No customers found in current records
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ fontWeight: '700' }}>{customer.name}</td>
                    <td>{customer.cnic || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{customer.phone_number || '-'}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{customer.email}</span>
                      </div>
                    </td>
                    <td>{customer.address || '-'}</td>
                    <td>
                      <span className={`premium-badge ${customer.status === 'successful' ? 'premium-badge-success' :
                          customer.status === 'unsuccessful' ? 'premium-badge-danger' :
                            'premium-badge-warning'
                        }`}>
                        {customer.status || 'potential'}
                      </span>
                    </td>
                    <td>
                      {customer.source === 'lead_conversion' ? (
                        <span className="premium-badge premium-badge-info">Converted Lead</span>
                      ) : (
                        <span className="premium-badge premium-badge-neutral">Walk-in</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleEdit(customer)}
                        >
                          Edit
                        </button>
                        <button
                          className="premium-btn premium-btn-danger"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleDelete(customer.id)}
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
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingCustomer ? 'Edit Customer' : 'Add Walk-in Customer'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name *</label>
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
                <label>CNIC</label>
                <input
                  type="text"
                  value={formData.cnic}
                  onChange={(e) =>
                    setFormData({ ...formData, cnic: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  value={formData.phone_number}
                  onChange={(e) =>
                    setFormData({ ...formData, phone_number: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Residential Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  rows="3"
                />
              </div>
              {editingCustomer && (
                <div className="form-group">
                  <label>Engagement Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="potential">Potential</option>
                    <option value="successful">Successful</option>
                    <option value="unsuccessful">Unsuccessful</option>
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="premium-btn premium-btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingCustomer ? 'Update Profile' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
