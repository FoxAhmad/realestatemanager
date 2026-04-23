import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaUserPlus, FaHistory, FaUserTag, FaExchangeAlt, FaEdit, FaTrash } from 'react-icons/fa';
import './Leads.css';

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [currentLeadHistory, setCurrentLeadHistory] = useState([]);
  const [currentLeadId, setCurrentLeadId] = useState(null);
  const { isAdmin, isAccountant, user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    email: '',
    source: 'social_media',
    status: 'new',
    interest_area: '',
    notes: '',
  });

  const [assignmentData, setAssignmentData] = useState({
    dealer_id: '',
  });

  useEffect(() => {
    fetchLeads();
    if (isAdmin || isAccountant) {
      fetchDealers();
    }
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await api.get('/leads');
      setLeads(response.data);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
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

  const fetchHistory = async (leadId) => {
    try {
      const response = await api.get(`/leads/${leadId}/history`);
      setCurrentLeadHistory(response.data);
      setCurrentLeadId(leadId);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLead) {
        await api.put(`/leads/${editingLead.id}`, formData);
      } else {
        await api.post('/leads', formData);
      }
      fetchLeads();
      setShowModal(false);
      setEditingLead(null);
      setFormData({
        name: '',
        phone_number: '',
        email: '',
        source: 'social_media',
        status: 'new',
        interest_area: '',
        notes: '',
      });
    } catch (error) {
      console.error('Error saving lead:', error);
      alert(error.response?.data?.message || 'Error saving lead');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/leads/${currentLeadId}/assign`, assignmentData);
      fetchLeads();
      setShowAssignModal(false);
      setAssignmentData({ dealer_id: '' });
      alert('Lead assigned successfully');
    } catch (error) {
      console.error('Error assigning lead:', error);
      alert(error.response?.data?.message || 'Error assigning lead');
    }
  };

  const handleEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name || '',
      phone_number: lead.phone_number || '',
      email: lead.email || '',
      source: lead.source || 'social_media',
      status: lead.status || 'new',
      interest_area: lead.interest_area || '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      try {
        await api.delete(`/leads/${id}`);
        fetchLeads();
      } catch (error) {
        console.error('Error deleting lead:', error);
        alert('Error deleting lead');
      }
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      new: <span className="premium-badge premium-badge-info">New</span>,
      contacted: <span className="premium-badge premium-badge-warning">Contacted</span>,
      qualified: <span className="premium-badge premium-badge-success">Qualified</span>,
      lost: <span className="premium-badge premium-badge-danger">Lost</span>,
      converted: <span className="premium-badge premium-badge-neutral">Converted</span>,
    };
    return badges[status] || status;
  };

  if (loading) {
    return <div className="leads-loading">Initializing Lead Hub...</div>;
  }

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Lead Management</h1>
          <p>Track and nurture your potential clients effectively.</p>
        </div>
        <div className="header-actions">
          <button
            className="premium-btn premium-btn-primary"
            onClick={() => {
              setEditingLead(null);
              setFormData({ name: '', phone_number: '', email: '', source: 'social_media', status: 'new', interest_area: '', notes: '' });
              setShowModal(true);
            }}
          >
            <FaUserPlus /> Add New Lead
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Contact info</th>
                <th>Source</th>
                <th>Interest</th>
                <th>Status</th>
                {(isAdmin || isAccountant) && <th>Assigned To</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={(isAdmin || isAccountant) ? 7 : 6} className="empty-state">
                    No leads found in your pipeline
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: '700' }}>{lead.name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{lead.phone_number}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lead.email}</span>
                      </div>
                    </td>
                    <td><span className="premium-badge premium-badge-neutral">{(lead.source || 'other').replace('_', ' ')}</span></td>
                    <td>{lead.interest_area || '-'}</td>
                    <td>{getStatusBadge(lead.status)}</td>
                    {(isAdmin || isAccountant) && (
                      <td>{lead.assigned_to_name || <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Unassigned</span>}</td>
                    )}
                    <td>
                      <div className="action-buttons">
                        {(isAdmin || isAccountant) && (
                          <button
                            className="premium-btn premium-btn-secondary"
                            style={{ padding: '0.4rem 0.6rem' }}
                            title="Assign Lead"
                            onClick={() => {
                              setCurrentLeadId(lead.id);
                              setShowAssignModal(true);
                            }}
                          >
                            <FaExchangeAlt />
                          </button>
                        )}
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="View History"
                          onClick={() => fetchHistory(lead.id)}
                        >
                          <FaHistory />
                        </button>
                        <button
                          className="premium-btn premium-btn-secondary"
                          style={{ padding: '0.4rem 0.6rem' }}
                          title="Edit"
                          onClick={() => handleEdit(lead)}
                        >
                          <FaEdit />
                        </button>
                        {isAdmin && (
                          <button
                            className="premium-btn premium-btn-danger"
                            style={{ padding: '0.4rem 0.6rem' }}
                            title="Delete"
                            onClick={() => handleDelete(lead.id)}
                          >
                            <FaTrash />
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLead ? 'Edit Lead' : 'Add New Lead'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  >
                    <option value="social_media">Social Media</option>
                    <option value="walk_in">Walk-in</option>
                    <option value="referral">Referral</option>
                    <option value="website">Website</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Interest Area (Project/Plot Type)</label>
                <input
                  type="text"
                  value={formData.interest_area}
                  onChange={(e) => setFormData({ ...formData, interest_area: e.target.value })}
                  placeholder="e.g. 5 Marla Residential, DHA Phase 6"
                />
              </div>
              <div className="form-group">
                <label>Notes / Update</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Enter current interaction details..."
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingLead ? 'Update Lead' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Interaction History</h2>
            <div className="history-list">
              {currentLeadHistory.length === 0 ? (
                <p className="empty-state">No history recorded for this lead yet.</p>
              ) : (
                currentLeadHistory.map((h, i) => (
                  <div key={i} className="history-item">
                    <div className="history-header">
                      <strong>{new Date(h.created_at).toLocaleString()}</strong>
                      {getStatusBadge(h.status)}
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>{h.notes || 'No notes provided.'}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Logged by: {h.created_by_name}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="premium-btn premium-btn-secondary" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Assign Lead to Salesperson</h2>
            <form onSubmit={handleAssign}>
              <div className="form-group">
                <label>Select Salesperson</label>
                <select
                  value={assignmentData.dealer_id}
                  onChange={(e) => setAssignmentData({ dealer_id: e.target.value })}
                  required
                >
                  <option value="">Choose a salesperson...</option>
                  {dealers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
