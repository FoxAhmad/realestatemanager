import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './Employees.css';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    role: 'accountant',
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({ role: employee.role });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/employees/${editingEmployee.id}`, formData);
      fetchEmployees();
      setShowModal(false);
      setEditingEmployee(null);
    } catch (error) {
      console.error('Error updating employee:', error);
      alert(error.response?.data?.message || 'Error updating employee');
    }
  };

  if (loading) return <div className="employees-loading">Staffing Command Center...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Organization Staff</h1>
          <p>Control internal access and define operational roles for your team.</p>
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Access Email</th>
                <th>Security Role</th>
                <th>Onboarding Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No active staff members found
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.name}</td>
                    <td>{emp.email}</td>
                    <td>
                      <span className={`premium-badge ${
                        emp.role === 'admin' ? 'premium-badge-primary' : 
                        emp.role === 'accountant' ? 'premium-badge-success' : 
                        'premium-badge-warning'
                      }`}>
                        {emp.role.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(emp.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="premium-btn premium-btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => handleEdit(emp)}
                      >
                        Adjust Role
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
            <h2>Reassign Staff Role</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Updating role for <strong>{editingEmployee?.name}</strong>
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Operational Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ role: e.target.value })}
                >
                  <option value="admin">Administrator</option>
                  <option value="accountant">Accountant</option>
                  <option value="dealer">Salesperson (Dealer)</option>
                </select>
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
                  Apply Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
