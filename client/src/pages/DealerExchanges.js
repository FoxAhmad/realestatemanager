import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FaEdit, FaTrash, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import MutualNetReport from '../components/MutualNetReport';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './DealerExchanges.css';

const DEALER_EXCHANGE_COLUMNS = [
  { key: 'exchange_date', label: 'Date', type: 'date' },
  { key: 'sender_name', label: 'Sender', type: 'text' },
  { key: 'receiver_name', label: 'Receiver', type: 'text' },
  { key: 'detail', label: 'Reference / Detail', type: 'text', accessor: (row) => row.detail || row.description },
  { key: 'amount', label: 'Amount', type: 'currency' },
];

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
  const [deletingId, setDeletingId] = useState(null);
  const [expandedPairs, setExpandedSenders] = useState(() => new Set());
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

  const closeModal = () => {
    setShowModal(false);
    setEditingExchange(null);
  };

  // Management can touch any row; a dealer only rows they are a party to (mirrors the API).
  const canModify = (ex) =>
    isAdmin || isAccountant || ex.sender_id === user?.id || ex.receiver_id === user?.id;

  /**
   * The row stores absolute sender/receiver, but the form works in terms of one primary
   * party plus a direction. Management edits from the sender's point of view; a dealer
   * edits from their own, so "Sent"/"Received" reads correctly for whoever is looking.
   */
  const openEdit = (ex) => {
    const base = (isAdmin || isAccountant) ? ex.sender_id : user.id;
    const isReceiving = ex.receiver_id === base && ex.sender_id !== base;

    setEditingExchange(ex);
    setFormData({
      override_sender_id: String(base),
      receiver_id: String(isReceiving ? ex.sender_id : ex.receiver_id),
      amount: String(ex.amount),
      direction: isReceiving ? 'receive' : 'send',
      exchange_date: ex.exchange_date
        ? new Date(ex.exchange_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      detail: ex.detail || '',
      proof_file: null
    });
    setShowModal(true);
  };

  const handleDelete = async (ex) => {
    const amt = parseFloat(ex.amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const ok = window.confirm(
      `Delete this mutual exchange?\n\n`
      + `${ex.sender_name} → ${ex.receiver_name} for ${amt}\n\n`
      + `The net balance between them will be recalculated. This cannot be undone.`
    );
    if (!ok) return;

    setDeletingId(ex.id);
    try {
      await api.delete(`/dealer-exchanges/${ex.id}`);
      fetchExchanges();
      fetchBalances();
    } catch (error) {
      alert(error.response?.data?.message || 'Error deleting exchange');
    } finally {
      setDeletingId(null);
    }
  };

  // On create this is the accountant's dealer list. When editing, the primary party may be
  // an admin (absent from /dealers), so widen it to peers + self and dedupe.
  const primaryPartyOptions = editingExchange
    ? [
        { id: user?.id, name: `${user?.name || 'Me'} (me)` },
        ...peers.map((p) => ({ id: p.id, name: `${p.name} (${p.role})` }))
      ].filter((o, i, arr) => o.id != null && arr.findIndex((x) => x.id === o.id) === i)
    : dealers.map((d) => ({ id: d.id, name: d.name }));

  const togglePairGroup = (pairKey) => {
    setExpandedSenders((prev) => {
      const next = new Set(prev);
      if (next.has(pairKey)) next.delete(pairKey);
      else next.add(pairKey);
      return next;
    });
  };

  const {
    search, setSearch,
    filters, setFilter, clearFilters,
    filteredData: filteredExchanges,
    uniqueValues,
    showFilters, setShowFilters,
    activeFilterCount,
  } = useTableFilters(exchanges, DEALER_EXCHANGE_COLUMNS);

  // Groups rows by the directional sender+receiver pair — "Adil -> Danish" and
  // "Danish -> Adil" are kept separate, so the collapsed total only ever sums
  // entries that went the same direction between the same two parties.
  const senderGroups = [];
  const groupIndexByPair = new Map();
  filteredExchanges.forEach((ex) => {
    const partyA = ex.sender_name || 'Unknown';
    const partyB = ex.receiver_name || 'Unknown';
    const key = `${partyA}|||${partyB}`;
    if (!groupIndexByPair.has(key)) {
      groupIndexByPair.set(key, senderGroups.length);
      senderGroups.push({ pairKey: key, partyA, partyB, entries: [] });
    }
    senderGroups[groupIndexByPair.get(key)].entries.push(ex);
  });

  const renderExchangeRow = (ex, { nested = false } = {}) => (
    <tr key={ex.id} className={nested ? 'mutual-subrow' : undefined}>
      <td data-label="Date">{new Date(ex.exchange_date).toLocaleDateString()}</td>
      <td data-label="Sender" style={{ fontWeight: 700 }}>{ex.sender_name}</td>
      <td data-label="Receiver" style={{ fontWeight: 700 }}>{ex.receiver_name}</td>
      <td data-label="Reference / Detail">{ex.detail || ex.description}</td>
      <td data-label="Amount" style={{ fontWeight: 800, color: 'var(--primary)' }}>
        Rs. {parseFloat(ex.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>
      <td data-label="Proof">
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
      <td data-label="Actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        {canModify(ex) ? (
          <>
            <button
              onClick={() => openEdit(ex)}
              title="Edit exchange"
              style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', padding: '5px' }}
            >
              <FaEdit size={16} />
            </button>
            <button
              onClick={() => handleDelete(ex)}
              disabled={deletingId === ex.id}
              title="Delete exchange"
              style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', padding: '5px' }}
            >
              <FaTrash size={15} />
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
        )}
      </td>
    </tr>
  );

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
        <TableToolbar
          columns={DEALER_EXCHANGE_COLUMNS}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          uniqueValues={uniqueValues}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          onClearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          searchPlaceholder="Search exchanges by sender, receiver, detail..."
          resultCount={filteredExchanges.length}
        />
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
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExchanges.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    No mutual transactions recorded in the current period
                  </td>
                </tr>
              ) : (
                senderGroups.map((group) => {
                  if (group.entries.length === 1) {
                    return renderExchangeRow(group.entries[0]);
                  }

                  const isExpanded = expandedPairs.has(group.pairKey);
                  const total = group.entries.reduce((sum, ex) => sum + parseFloat(ex.amount || 0), 0);

                  return (
                    <React.Fragment key={group.pairKey}>
                      <tr
                        className="mutual-group-row"
                        onClick={() => togglePairGroup(group.pairKey)}
                      >
                        <td data-label="Date">—</td>
                        <td data-label="Sender" style={{ fontWeight: 700 }}>
                          <span className="mutual-group-toggle">
                            {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                          </span>
                          {group.partyA}
                          <span className="premium-badge premium-badge-info mutual-group-count">
                            {group.entries.length} entries
                          </span>
                        </td>
                        <td data-label="Receiver" style={{ fontWeight: 700 }}>{group.partyB}</td>
                        <td data-label="Reference / Detail">—</td>
                        <td data-label="Amount" style={{ fontWeight: 800, color: 'var(--primary)' }}>
                          Rs. {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td data-label="Proof">—</td>
                        <td data-label="Actions">—</td>
                      </tr>
                      {isExpanded && group.entries.map((ex) => renderExchangeRow(ex, { nested: true }))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingExchange ? 'Edit Mutual Exchange' : 'Capture Mutual Exchange'}</h2>
            <form onSubmit={handleSubmit}>
              {(isAccountant || (isAdmin && editingExchange)) && (
                <div className="form-group">
                  <label>{editingExchange ? 'Primary Party' : 'Recording For (Primary Dealer)'} *</label>
                  <select
                    value={formData.override_sender_id}
                    onChange={(e) => setFormData({ ...formData, override_sender_id: e.target.value })}
                    required
                  >
                    <option value="">Select dealer to record for...</option>
                    {primaryPartyOptions.map((d) => (
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
                <button type="button" className="premium-btn premium-btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="premium-btn premium-btn-primary">
                  {editingExchange ? 'Save Changes' : 'Confirm Transaction'}
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
