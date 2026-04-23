import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaUserPlus, FaEdit, FaTrash, FaShieldAlt } from 'react-icons/fa';
import './Investors.css';

const Investors = () => {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    cnic: '',
    contact_number: '',
    address: '',
  });

  const { isAdmin, isAccountant } = useAuth();

  useEffect(() => {
    if (isAdmin || isAccountant) {
      fetchInvestors();
    } else {
      setLoading(false);
    }
  }, [isAdmin, isAccountant]);

  const fetchInvestors = async () => {
    try {
      const response = await api.get('/investors');
      setInvestors(response.data);
    } catch (error) {
      console.error('Error fetching investors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingInvestor) {
        await api.put(`/investors/${editingInvestor.id}`, formData);
      } else {
        await api.post('/investors', formData);
      }
      fetchInvestors();
      setShowModal(false);
      setEditingInvestor(null);
      setFormData({ name: '', cnic: '', contact_number: '', address: '' });
    } catch (error) {
      console.error('Error saving investor:', error);
      alert(error.response?.data?.message || 'Error saving investor');
    }
  };

  const handleEdit = (investor) => {
    setEditingInvestor(investor);
    setFormData({
      name: investor.name || '',
      cnic: investor.cnic || '',
      contact_number: investor.contact_number || '',
      address: investor.address || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this investor?')) {
      try {
        await api.delete(`/investors/${id}`);
        fetchInvestors();
      } catch (error) {
        console.error('Error deleting investor:', error);
        alert('Error deleting investor');
      }
    }
  };

  if (!(isAdmin || isAccountant)) {
    return (
      <div className="premium-page">
        <div className="glass-card investors-access-denied">
          <FaShieldAlt style={{ fontSize: '4rem', color: 'var(--danger)', marginBottom: '1.5rem' }} />
          <h2>Restricted Repository</h2>
          <p>You do not have the clearance levels required to view the Investor Registry.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="investors-loading">Synchronizing Investor Database...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Investor Relations</h1>
          <p>Master registry of capital partners and their portfolio allocations.</p>
        </div>
        <button
          className="premium-btn premium-btn-primary"
          onClick={() => {
            setEditingInvestor(null);
            setFormData({ name: '', cnic: '', contact_number: '', address: '' });
            setShowModal(true);
          }}
        >
          <FaUserPlus /> Onboard Investor
        </button>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Partner Name</th>
                <th>Identity (CNIC)</th>
                <th>Communication</th>
                <th>Current Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investors.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No registered investors found in current portfolio
                  </td>
                </tr>
              ) : (
                investors.map((investor) => (
                  <tr key={investor.id}>
                    <td style={{ fontWeight: '700' }}>{investor.name}</td>
                    <td>{investor.cnic}</td>
                    <td>{investor.contact_number}</td>
                    <td>
                      <span className={parseFloat(investor.balance) >= 0 ? 'balance-positive' : 'balance-negative'}>
                        ${parseFloat(investor.balance || 0).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleEdit(investor)}
                        >
                           Profile
                        </button>
                        <button
                          className="premium-btn premium-btn-danger"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handleDelete(investor.id)}
                        >
                          Revoke
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
            <h2>{editingInvestor ? 'Update Investor Profile' : 'Onboard New Partner'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Legal Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>CNIC Number *</label>
                <input
                  type="text"
                  value={formData.cnic}
                  onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contact Number</label>
                <input
                  type="text"
                  value={formData.contact_number}
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Registered Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingInvestor ? 'Update Credentials' : 'Authorize Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Investors;
