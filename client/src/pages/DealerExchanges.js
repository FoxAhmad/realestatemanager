import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import MutualNetReport from '../components/MutualNetReport';
import './DealerExchanges.css';

const DealerExchanges = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';
  const [exchanges, setExchanges] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExchange, setEditingExchange] = useState(null);
  const [balances, setBalances] = useState([]);
  const [peers, setPeers] = useState([]);
  const [formData, setFormData] = useState({
    override_sender_id: '',
    receiver_id: '',
    amount: '',
    direction: 'send',
    exchange_date: new Date().toISOString().split('T')[0],
    detail: '',
    proof_file: null
  });

  useEffect(() => {
    fetchExchanges();
    fetchDealers();
    fetchPeers();
    fetchBalances();
  }, []);

  const fetchExchanges = async () => {
    try {
      const response = await api.get('/dealer-exchanges');
      setExchanges(response.data);
    } catch (error) {
      console.error('Error fetching exchanges:', error);
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

  const fetchPeers = async () => {
    try {
      const response = await api.get('/dealer-exchanges/peers');
      setPeers(response.data);
    } catch (error) {
      console.error('Error fetching peers:', error);
    }
  };

  const fetchBalances = async () => {
    try {
      const response = await api.get('/dealer-exchanges/balances');
      setBalances(response.data.peerBalances || []);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null) data.append(key, formData[key]);
      });

      if (editingExchange) {
        await api.put(`/dealer-exchanges/${editingExchange.id}`, data);
      } else {
        await api.post('/dealer-exchanges', data);
      }
      fetchExchanges();
      fetchBalances();
      setShowModal(false);
      setEditingExchange(null);
      setFormData({
        override_sender_id: '',
        receiver_id: '',
        amount: '',
        direction: 'send',
        exchange_date: new Date().toISOString().split('T')[0],
        detail: '',
        proof_file: null
      });
    } catch (error) {
      console.error('Error saving exchange:', error);
      alert(error.response?.data?.message || 'Error saving exchange');
    }
  };

  if (loading) return <div className="dealer-exchanges-loading">Loading Ledger Analytics...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Dealer Mutual Exchanges</h1>
          <p>Track advances, savings, and certificate payments for authorized dealers.</p>
        </div>
        <button
          className="premium-btn premium-btn-primary"
          onClick={() => {
            setEditingExchange(null);
            setFormData({
              override_sender_id: '',
              receiver_id: '',
              amount: '',
              direction: 'send',
              exchange_date: new Date().toISOString().split('T')[0],
              detail: '',
              proof_file: null
            });
            setShowModal(true);
          }}
        >
          + Record Mutual Exchange
        </button>
      </div>

      <div className="net-report-section" style={{ marginBottom: '2rem' }}>
        <MutualNetReport 
          balances={balances}
          isAdmin={isAdmin}
          isAccountant={isAccountant}
          mode="full"
        />
      </div>

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sender</th>
                <th>Receiver</th>
                <th>Reference / Detail</th>
                <th>Amount</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {exchanges.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">
                    No mutual transactions recorded in the current period
                  </td>
                </tr>
              ) : (
                exchanges.map((ex) => (
                  <tr key={ex.id}>
                    <td>{new Date(ex.exchange_date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 700 }}>{ex.sender_name}</td>
                    <td style={{ fontWeight: 700 }}>{ex.receiver_name}</td>
                    <td>{ex.detail || ex.description}</td>
                    <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                      ${parseFloat(ex.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      {ex.proof_file ? (
                        <a 
                          href={ex.proof_file.startsWith('http') ? ex.proof_file : `${process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace('/api', '') : 'http://localhost:5000'}${ex.proof_file}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="premium-badge premium-badge-info"
                          style={{ textDecoration: 'none', cursor: 'pointer' }}
                        >
                          View Proof
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                      )}
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
            <h2>Capture Mutual Exchange</h2>
            <form onSubmit={handleSubmit}>
              {isAccountant && (
                <div className="form-group">
                  <label>Recording For (Primary Dealer) *</label>
                  <select
                    value={formData.override_sender_id}
                    onChange={(e) => setFormData({ ...formData, override_sender_id: e.target.value })}
                    required
                  >
                    <option value="">Select dealer to record for...</option>
                    {dealers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Counterparty (Who they exchanged with) *</label>
                <select
                  value={formData.receiver_id}
                  onChange={(e) => setFormData({ ...formData, receiver_id: e.target.value })}
                  required
                >
                  <option value="">Select counterparty...</option>
                  {peers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Direction *</label>
                <div className="direction-toggle">
                  <button
                    type="button"
                    className={`direction-btn ${formData.direction === 'send' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, direction: 'send' })}
                  >
                    Sent to Peer
                  </button>
                  <button
                    type="button"
                    className={`direction-btn ${formData.direction === 'receive' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, direction: 'receive' })}
                  >
                    Received from Peer
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Voucher Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Exchange Date *</label>
                <input
                  type="date"
                  value={formData.exchange_date}
                  onChange={(e) => setFormData({ ...formData, exchange_date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Transaction Detail</label>
                <textarea
                  value={formData.detail}
                  onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Proof of Exchange (Image/PDF)</label>
                <input
                  type="file"
                  onChange={(e) => setFormData({ ...formData, proof_file: e.target.files[0] })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  Confirm Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealerExchanges;
