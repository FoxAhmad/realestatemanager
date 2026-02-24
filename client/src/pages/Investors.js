import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Investors.css';

const Investors = () => {
  const { isAdmin, isDealer, user } = useAuth();
  const [investors, setInvestors] = useState([]);
  const [investorBalances, setInvestorBalances] = useState([]);
  const [salespersonBalance, setSalespersonBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    total_invested: '',
    paid_amount: '',
  });

  useEffect(() => {
    fetchInvestors();
    if (user) {
      fetchBalances();
    }
  }, [user]);

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

  const fetchBalances = async () => {
    try {
      // Fetch salesperson total balance
      const balanceResponse = await api.get(`/inventory-payments/salesperson/${user.id}/balance`);
      setSalespersonBalance(balanceResponse.data);

      // Fetch individual investor balances
      const investorsResponse = await api.get(`/inventory-payments/salesperson/${user.id}/investors/balances`);
      setInvestorBalances(investorsResponse.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingInvestor) {
        await api.put(
          `/investors/${editingInvestor.id}`,
          formData
        );
      } else {
        await api.post('/investors', formData);
      }
      fetchInvestors();
      if (user) {
        fetchBalances();
      }
      setShowModal(false);
      setEditingInvestor(null);
      setFormData({
        name: '',
        phone: '',
        address: '',
        total_invested: '',
        paid_amount: '',
      });
    } catch (error) {
      console.error('Error saving investor:', error);
      alert(error.response?.data?.message || 'Error saving investor');
    }
  };

  const handleEdit = (investor) => {
    setEditingInvestor(investor);
    setFormData({
      name: investor.name || '',
      phone: investor.phone || '',
      address: investor.address || '',
      total_invested: investor.total_invested || '',
      paid_amount: investor.paid_amount || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this investor?')) {
      try {
        await api.delete(`/investors/${id}`);
        fetchInvestors();
        if (user) {
          fetchBalances();
        }
      } catch (error) {
        console.error('Error deleting investor:', error);
        alert('Error deleting investor');
      }
    }
  };

  const getInvestorBalance = (investorId) => {
    return investorBalances.find(b => b.id === investorId) || null;
  };


  if (loading) {
    return <div className="investors-loading">Loading investors...</div>;
  }

  return (
    <div className="investors">
      <div className="investors-header">
        <h1 className="investors-title">My Investors</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingInvestor(null);
            setFormData({
              name: '',
              phone: '',
              address: '',
              total_invested: '',
              paid_amount: '',
            });
            setShowModal(true);
          }}
        >
          + Add Investor
        </button>
      </div>

      {salespersonBalance && (
        <div style={{
          background: '#f8f9fa',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>Total Balance Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Total Invested</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#333' }}>
                ${parseFloat(salespersonBalance.total_invested || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Total Used</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc3545' }}>
                ${parseFloat(salespersonBalance.total_used || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Remaining Balance</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#28a745' }}>
                ${parseFloat(salespersonBalance.remaining_balance || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="investors-table-container">
        <table className="investors-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Total Invested</th>
              <th>Used Balance</th>
              <th>Remaining Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {investors.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  No investors found
                </td>
              </tr>
            ) : (
              investors.map((investor) => {
                const balance = getInvestorBalance(investor.id);
                const usedBalance = balance ? parseFloat(balance.used_balance || 0) : parseFloat(investor.paid_amount || 0);
                const remainingBalance = balance ? parseFloat(balance.remaining_balance || 0) : parseFloat(investor.remaining_balance || 0);

                return (
                  <tr key={investor.id}>
                    <td>{investor.name}</td>
                    <td>{investor.phone || '-'}</td>
                    <td>{investor.address || '-'}</td>
                    <td>${parseFloat(investor.total_invested || 0).toLocaleString()}</td>
                    <td style={{ color: '#dc3545', fontWeight: '500' }}>
                      ${usedBalance.toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          color: remainingBalance > 0 ? '#28a745' : '#dc3545',
                          fontWeight: '500'
                        }}
                      >
                        ${remainingBalance.toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-edit"
                          onClick={() => handleEdit(investor)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(investor.id)}
                        >
                          Delete
                        </button>
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
            <h2>
              {editingInvestor ? 'Edit Investor' : 'Add Investor'}
            </h2>
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
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
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
              <div className="form-group">
                <label>Total Invested</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_invested}
                  onChange={(e) =>
                    setFormData({ ...formData, total_invested: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Paid Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.paid_amount}
                  onChange={(e) =>
                    setFormData({ ...formData, paid_amount: e.target.value })
                  }
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowModal(false);
                    setEditingInvestor(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingInvestor ? 'Update' : 'Create'}
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

