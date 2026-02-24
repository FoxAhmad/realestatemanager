import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './InventoryRequests.css';

const InventoryRequests = () => {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await api.get('/inventory-requests');
      setRequests(response.data);
    } catch (error) {
      console.error('Error fetching inventory requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      await api.post(`/inventory-requests/${requestId}/approve`, {
        admin_notes: adminNotes
      });
      alert('Request approved successfully');
      fetchRequests();
      setActionModal(null);
      setAdminNotes('');
    } catch (error) {
      console.error('Error approving request:', error);
      alert(error.response?.data?.message || 'Error approving request');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await api.post(`/inventory-requests/${requestId}/reject`, {
        admin_notes: adminNotes
      });
      alert('Request rejected successfully');
      fetchRequests();
      setActionModal(null);
      setAdminNotes('');
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert(error.response?.data?.message || 'Error rejecting request');
    }
  };

  const handleDelete = async (requestId) => {
    if (window.confirm('Are you sure you want to delete this request?')) {
      try {
        await api.delete(`/inventory-requests/${requestId}`);
        fetchRequests();
      } catch (error) {
        console.error('Error deleting request:', error);
        alert(error.response?.data?.message || 'Error deleting request');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: 'Pending', class: 'status-pending' },
      approved: { label: 'Approved', class: 'status-approved' },
      rejected: { label: 'Rejected', class: 'status-rejected' },
    };
    const statusInfo = statusMap[status] || statusMap.pending;
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.label}</span>;
  };

  const getCategoryLabel = (category) => {
    const labels = {
      plot: 'Plot',
      house: 'House',
      shop_office: 'Shop/Office',
    };
    return labels[category] || category;
  };

  if (loading) {
    return <div className="inventory-requests-loading">Loading inventory requests...</div>;
  }

  return (
    <div className="inventory-requests">
      <div className="inventory-requests-header">
        <h1 className="inventory-requests-title">Inventory Requests</h1>
      </div>

      <div className="inventory-requests-table-container">
        <table className="inventory-requests-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Inventory</th>
              <th>Category</th>
              <th>Price</th>
              {isAdmin && <th>Salesperson</th>}
              <th>Status</th>
              <th>Request Date</th>
              {isAdmin && <th>Admin Notes</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 7} className="empty-state">
                  No inventory requests found
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id}>
                  <td>{request.id}</td>
                  <td>{request.inventory_address || '-'}</td>
                  <td>{getCategoryLabel(request.category)}</td>
                  <td>
                    {request.inventory_price
                      ? `$${parseFloat(request.inventory_price).toLocaleString()}`
                      : '-'}
                  </td>
                  {isAdmin && (
                    <td>
                      {request.salesperson_name || '-'}
                      {request.salesperson_email && (
                        <div className="email-text">{request.salesperson_email}</div>
                      )}
                    </td>
                  )}
                  <td>{getStatusBadge(request.status)}</td>
                  <td>
                    {new Date(request.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  {isAdmin && (
                    <td>
                      {request.admin_notes ? (
                        <span className="notes-text">{request.admin_notes}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                  )}
                  <td>
                    <div className="action-buttons">
                      {isAdmin && request.status === 'pending' && (
                        <>
                          <button
                            className="btn-approve"
                            onClick={() => setActionModal({ type: 'approve', request })}
                          >
                            Approve
                          </button>
                          <button
                            className="btn-reject"
                            onClick={() => setActionModal({ type: 'reject', request })}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {(request.status === 'pending' || isAdmin) && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(request.id)}
                        >
                          Delete
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

      {actionModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setActionModal(null);
            setAdminNotes('');
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>
              {actionModal.type === 'approve' ? 'Approve Request' : 'Reject Request'}
            </h2>
            <div className="request-info">
              <p>
                <strong>Inventory:</strong> {getCategoryLabel(actionModal.request.category)} -{' '}
                {actionModal.request.inventory_address}
              </p>
              {isAdmin && actionModal.request.salesperson_name && (
                <p>
                  <strong>Salesperson:</strong> {actionModal.request.salesperson_name}
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Admin Notes (Optional)</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows="3"
                placeholder="Add notes about this decision..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setActionModal(null);
                  setAdminNotes('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  actionModal.type === 'approve' ? 'btn-approve' : 'btn-reject'
                }
                onClick={() => {
                  if (actionModal.type === 'approve') {
                    handleApprove(actionModal.request.id);
                  } else {
                    handleReject(actionModal.request.id);
                  }
                }}
              >
                {actionModal.type === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryRequests;

