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
    return <div className="customers-loading">Loading customers...</div>;
  }

  return (
    <div className="customers">
      <div className="customers-header">
        <h1 className="customers-title">Customers</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingCustomer(null);
            setFormData({ name: '', cnic: '', phone_number: '', email: '', address: '', status: 'potential' });
            setShowModal(true);
          }}
        >
          + Add Walk-in Customer
        </button>
      </div>

      <div className="customers-table-container">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>CNIC</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>Address</th>
              <th>Status</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty-state">
                  No customers found
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.cnic || '-'}</td>
                  <td>{customer.phone_number || '-'}</td>
                  <td>{customer.email || '-'}</td>
                  <td>{customer.address || '-'}</td>
                  <td>
                    <span className={`badge ${customer.status === 'successful' ? 'badge-success' :
                        customer.status === 'unsuccessful' ? 'badge-danger' :
                          'badge-warning'
                      }`}>
                      {customer.status || 'potential'}
                    </span>
                  </td>
                  <td>
                    {customer.source === 'lead_conversion' ? (
                      <span className="badge badge-info">Lead Conversion</span>
                    ) : (
                      <span className="badge badge-secondary">Walk-in</span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(customer)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingCustomer ? 'Edit Customer' : 'Add Walk-in Customer'}</h2>
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
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Address</label>
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
                  <label>Status</label>
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
                  className="btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCustomer(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCustomer ? 'Update' : 'Create'}
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

