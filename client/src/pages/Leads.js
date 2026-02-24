import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Leads.css';

const Leads = () => {
  const { isAdmin, user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(null);
  const [showStatusUpdateModal, setShowStatusUpdateModal] = useState(null);
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [statusUpdateForm, setStatusUpdateForm] = useState({
    update_date: new Date().toISOString().split('T')[0],
    activity_type: 'called',
    description: '',
  });
  const [statusChangeForm, setStatusChangeForm] = useState({
    status: 'new',
  });
  const [selectedSalesperson, setSelectedSalesperson] = useState('');

  useEffect(() => {
    fetchLeads();
    if (isAdmin) {
      fetchSalespersons();
    }
  }, [isAdmin]);

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

  const fetchSalespersons = async () => {
    try {
      const response = await api.get('/dealers');
      setSalespersons(response.data);
    } catch (error) {
      console.error('Error fetching salespersons:', error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      alert('Please upload an Excel file (.xlsx or .xls) or CSV file (.csv)');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/leads/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      alert(`Successfully imported ${response.data.imported} leads. ${response.data.skipped} duplicates skipped.`);
      fetchLeads();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(error.response?.data?.message || 'Error uploading file');
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleAssign = async () => {
    if (!selectedSalesperson) {
      alert('Please select a salesperson');
      return;
    }

    try {
      await api.post(`/leads/${showAssignModal.id}/assign`, {
        salesperson_id: parseInt(selectedSalesperson),
      });
      alert('Lead assigned successfully');
      fetchLeads();
      setShowAssignModal(null);
      setSelectedSalesperson('');
    } catch (error) {
      console.error('Error assigning lead:', error);
      alert(error.response?.data?.message || 'Error assigning lead');
    }
  };

  const handleAutoAssign = async () => {
    if (!window.confirm('This will assign all unassigned leads equally to all salespersons. Continue?')) {
      return;
    }

    try {
      const response = await api.post('/leads/auto-assign');
      alert(`Successfully assigned ${response.data.assigned} leads to ${response.data.salespersons} salespersons`);
      fetchLeads();
    } catch (error) {
      console.error('Error auto-assigning leads:', error);
      alert(error.response?.data?.message || 'Error auto-assigning leads');
    }
  };

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!statusUpdateForm.description.trim()) {
      alert('Please enter a description');
      return;
    }

    try {
      await api.post(`/leads/${showStatusUpdateModal.id}/status-update`, statusUpdateForm);
      alert('Status update added successfully');
      fetchLeads();
      setShowStatusUpdateModal(null);
      setStatusUpdateForm({
        update_date: new Date().toISOString().split('T')[0],
        activity_type: 'called',
        description: '',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      alert(error.response?.data?.message || 'Error updating status');
    }
  };

  const handleStatusChange = async (e) => {
    e.preventDefault();
    const confirmMessage = statusChangeForm.status === 'successful'
      ? 'This will mark the lead as successful and create a customer record. Continue?'
      : statusChangeForm.status === 'unsuccessful'
        ? 'This will mark the lead as unsuccessful and create a customer record. Continue?'
        : 'Update lead status?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await api.put(`/leads/${showStatusChangeModal.id}/status`, {
        status: statusChangeForm.status,
      });
      alert('Lead status updated successfully');
      fetchLeads();
      setShowStatusChangeModal(null);
      setStatusChangeForm({ status: 'new' });
    } catch (error) {
      console.error('Error changing status:', error);
      alert(error.response?.data?.message || 'Error changing status');
    }
  };

  const handleViewHistory = async (lead) => {
    try {
      const response = await api.get(`/leads/${lead.id}/status-updates`);
      setStatusHistory(response.data);
      setShowHistoryModal(lead);
    } catch (error) {
      console.error('Error fetching history:', error);
      alert('Error fetching status history');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      new: <span className="badge badge-secondary">New</span>,
      contacted: <span className="badge badge-info">Contacted</span>,
      on_hold: <span className="badge badge-warning">On Hold</span>,
      successful: <span className="badge badge-success">Successful</span>,
      unsuccessful: <span className="badge badge-danger">Unsuccessful</span>,
    };
    return badges[status] || status;
  };

  if (loading) {
    return <div className="leads-loading">Loading leads...</div>;
  }

  return (
    <div className="leads">
      <div className="leads-header">
        <h1 className="leads-title">Leads</h1>
        <div className="leads-header-actions">
          {isAdmin && (
            <>
              <label className="btn-secondary" style={{ cursor: 'pointer', marginRight: '0.5rem' }}>
                {uploading ? 'Uploading...' : '+ Upload File'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  disabled={uploading}
                />
              </label>
              <button className="btn-primary" onClick={handleAutoAssign}>
                Auto Assign Leads
              </button>
            </>
          )}
        </div>
      </div>

      <div className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Campaign</th>
              <th>Lead Date</th>
              <th>Status</th>
              <th>Assigned To</th>
              {isAdmin && <th>Actions</th>}
              {!isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="empty-state">
                  No leads found
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.name}</td>
                  <td>{lead.email || '-'}</td>
                  <td>{lead.phone_number || '-'}</td>
                  <td>{lead.campaign_name || '-'}</td>
                  <td>{lead.lead_date ? new Date(lead.lead_date).toLocaleDateString() : '-'}</td>
                  <td>{getStatusBadge(lead.status)}</td>
                  <td>{lead.assigned_to_name || 'Unassigned'}</td>
                  <td>
                    <div className="action-buttons">
                      {isAdmin && !lead.assigned_to && (
                        <button
                          className="btn-assign"
                          onClick={() => {
                            setShowAssignModal(lead);
                            setSelectedSalesperson('');
                          }}
                        >
                          Assign
                        </button>
                      )}
                      {(isAdmin || lead.assigned_to === user?.id) && lead.status !== 'successful' && lead.status !== 'unsuccessful' && (
                        <>
                          <button
                            className="btn-edit"
                            onClick={() => {
                              setShowStatusUpdateModal(lead);
                              setStatusUpdateForm({
                                update_date: new Date().toISOString().split('T')[0],
                                activity_type: 'called',
                                description: '',
                              });
                            }}
                          >
                            Update Status
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setShowStatusChangeModal(lead);
                              setStatusChangeForm({ status: lead.status });
                            }}
                          >
                            Change Status
                          </button>
                        </>
                      )}
                      <button
                        className="btn-info"
                        onClick={() => handleViewHistory(lead)}
                      >
                        History
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Assign Lead to Salesperson</h2>
            <p><strong>Lead:</strong> {showAssignModal.name}</p>
            <div className="form-group">
              <label>Select Salesperson *</label>
              <select
                value={selectedSalesperson}
                onChange={(e) => setSelectedSalesperson(e.target.value)}
              >
                <option value="">Select a salesperson</option>
                {salespersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} ({sp.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAssignModal(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleAssign}>
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowStatusUpdateModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Daily Status Update</h2>
            <p><strong>Lead:</strong> {showStatusUpdateModal.name}</p>
            <form onSubmit={handleStatusUpdate}>
              <div className="form-group">
                <label>Update Date *</label>
                <input
                  type="date"
                  value={statusUpdateForm.update_date}
                  onChange={(e) =>
                    setStatusUpdateForm({ ...statusUpdateForm, update_date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Activity Type *</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="called"
                      checked={statusUpdateForm.activity_type === 'called'}
                      onChange={(e) =>
                        setStatusUpdateForm({ ...statusUpdateForm, activity_type: e.target.value })
                      }
                    />
                    <span style={{ marginLeft: '0.5rem' }}>Called</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="messaged"
                      checked={statusUpdateForm.activity_type === 'messaged'}
                      onChange={(e) =>
                        setStatusUpdateForm({ ...statusUpdateForm, activity_type: e.target.value })
                      }
                    />
                    <span style={{ marginLeft: '0.5rem' }}>Messaged</span>
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea
                  value={statusUpdateForm.description}
                  onChange={(e) =>
                    setStatusUpdateForm({ ...statusUpdateForm, description: e.target.value })
                  }
                  rows="4"
                  placeholder="Describe what happened during the call or message..."
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowStatusUpdateModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {showStatusChangeModal && (
        <div className="modal-overlay" onClick={() => setShowStatusChangeModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Change Lead Status</h2>
            <p><strong>Lead:</strong> {showStatusChangeModal.name}</p>
            <form onSubmit={handleStatusChange}>
              <div className="form-group">
                <label>Status *</label>
                <select
                  value={statusChangeForm.status}
                  onChange={(e) =>
                    setStatusChangeForm({ ...statusChangeForm, status: e.target.value })
                  }
                  required
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="on_hold">On Hold</option>
                  <option value="successful">Successful</option>
                  <option value="unsuccessful">Unsuccessful</option>
                </select>
                <small style={{ color: '#666', display: 'block', marginTop: '0.5rem' }}>
                  {statusChangeForm.status === 'successful' && 'This will create a customer with "successful" status'}
                  {statusChangeForm.status === 'unsuccessful' && 'This will create a customer with "unsuccessful" status'}
                </small>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowStatusChangeModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Status Update History</h2>
            <p><strong>Lead:</strong> {showHistoryModal.name}</p>
            {statusHistory.length === 0 ? (
              <p style={{ color: '#999', fontStyle: 'italic' }}>No status updates yet</p>
            ) : (
              <div className="history-list">
                {statusHistory.map((update) => (
                  <div key={update.id} className="history-item">
                    <div className="history-header">
                      <span className="badge badge-info">
                        {update.activity_type === 'called' ? 'Called' : 'Messaged'}
                      </span>
                      <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.875rem' }}>
                        {new Date(update.update_date).toLocaleDateString()} by {update.updated_by_name}
                      </span>
                    </div>
                    <p style={{ marginTop: '0.5rem', color: '#333' }}>{update.description}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowHistoryModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;

