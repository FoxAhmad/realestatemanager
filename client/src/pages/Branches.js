import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify } from '../utils/notify';
import './Billing.css';

const errMsg = (error, fallback) => error.response?.data?.message || fallback;

// Branch management. Only Platinum tenants can add/activate branches or assign users; the server
// enforces that regardless of what this page shows.
const Branches = () => {
  const [info, setInfo] = useState(null); // { plan, multiBranch, branches }
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [assigning, setAssigning] = useState(null); // branch being edited
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/branches');
      setInfo(data);
    } catch (error) {
      notify(errMsg(error, 'Could not load branches'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) notify(okMsg);
      await load();
    } catch (error) {
      notify(errMsg(error, 'Request failed'));
    }
  };

  const add = (e) => {
    e.preventDefault();
    run(() => api.post('/branches', { name: newName }), 'Branch created').then(() => setNewName(''));
  };

  const rename = (b) => {
    const name = window.prompt('Branch name', b.name);
    if (name && name.trim() && name !== b.name) run(() => api.put(`/branches/${b.id}`, { name }));
  };

  const toggle = (b) => run(() => api.put(`/branches/${b.id}`, { is_active: !b.is_active }));

  const openAssign = async (b) => {
    try {
      const [dealers, staff, current] = await Promise.all([
        api.get('/dealers'), api.get('/employees'), api.get(`/branches/${b.id}/users`),
      ]);
      // Admins can already access every branch, so only list users who need an assignment.
      const all = [...dealers.data, ...staff.data].filter((u) => u.role !== 'admin');
      setUsers([...new Map(all.map((u) => [u.id, u])).values()]);
      setSelected(current.data.map((u) => u.id));
      setAssigning(b);
    } catch (error) {
      notify(errMsg(error, 'Could not load users'));
    }
  };

  const saveAssign = () =>
    run(() => api.put(`/branches/${assigning.id}/users`, { userIds: selected }), 'Branch users updated').then(() => setAssigning(null));

  if (loading) return <div className="employees-loading">Loading branches...</div>;
  if (!info) return null;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Branches</h1>
          <p>
            Plan: <strong>{info.plan}</strong>.{' '}
            {info.multiBranch
              ? 'Create branches and choose which users can work in each.'
              : 'Your plan runs on a single branch. Upgrade to Platinum to add more branches.'}
          </p>
        </div>
      </div>

      {info.multiBranch && (
        <form className="glass-card form-grid" onSubmit={add}>
          <div className="form-group">
            <label>New Branch Name *</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="form-actions">
            <button className="premium-btn premium-btn-primary" type="submit">Add Branch</button>
          </div>
        </form>
      )}

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr><th>Branch</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {info.branches.map((b) => (
                <tr key={b.id}>
                  <td data-label="Branch" style={{ fontWeight: 700 }}>
                    {b.name} {b.is_default && <span className="premium-badge premium-badge-primary">MAIN</span>}
                  </td>
                  <td data-label="Status">
                    <span className={`premium-badge ${b.is_active ? 'premium-badge-success' : 'premium-badge-warning'}`}>
                      {b.is_active ? 'ACTIVE' : 'INACTIVE (read-only)'}
                    </span>
                  </td>
                  <td data-label="Actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="premium-btn premium-btn-secondary" onClick={() => rename(b)}>Rename</button>
                    {info.multiBranch && (
                      <>
                        <button className="premium-btn premium-btn-secondary" onClick={() => openAssign(b)}>Users</button>
                        {!b.is_default && (
                          <button className="premium-btn premium-btn-secondary" onClick={() => toggle(b)}>
                            {b.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assigning && (
        <div className="glass-card" style={{ padding: '1rem', marginTop: 16 }}>
          <h3>Users in {assigning.name}</h3>
          <p style={{ fontSize: '0.85rem' }}>Admins always have access to every branch. Users with no branch assigned work in the main branch.</p>
          {users.length === 0 && <p>No other users yet.</p>}
          {users.map((u) => (
            <label key={u.id} style={{ display: 'block', margin: '4px 0' }}>
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((id) => id !== u.id)))}
              />{' '}
              {u.name} <small>({u.role})</small>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="premium-btn premium-btn-primary" onClick={saveAssign}>Save</button>
            <button className="premium-btn premium-btn-secondary" onClick={() => setAssigning(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;
