import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify } from '../utils/notify';

export const PLANS = [
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'platinum', label: 'Platinum (multi-branch)' },
];

const EMPTY = { name: '', slug: '', plan: 'basic', adminName: '', adminEmail: '', adminPassword: '' };
const errMsg = (error, fallback) => error.response?.data?.message || fallback;

// Platform admin (super_admin) only: every tenant, change its plan or status, create a new tenant.
const Tenants = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/tenants');
      setTenants(data);
    } catch (error) {
      notify.error(errMsg(error, 'Could not load tenants'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (tenant, patch, okMsg) => {
    try {
      await api.put(`/tenants/${tenant.id}`, patch);
      notify.success(okMsg);
      await load();
    } catch (error) {
      notify.error(errMsg(error, 'Update failed'));
    }
  };

  const changePlan = (tenant, plan) => {
    if (plan === tenant.plan) return;
    const downgrade = tenant.plan === 'platinum' && plan !== 'platinum';
    const msg = downgrade
      ? `Move "${tenant.name}" from Platinum to ${plan}?\n\nNo data is deleted. Extra branches stay readable but become read-only, and the tenant works on its main branch only.`
      : `Change "${tenant.name}" to ${plan}?`;
    if (window.confirm(msg)) update(tenant, { plan }, `${tenant.name} is now on ${plan}`);
  };

  const toggleStatus = (tenant) => {
    const next = tenant.status === 'active' ? 'suspended' : 'active';
    const msg = next === 'suspended'
      ? `Suspend "${tenant.name}"? Nobody in this tenant will be able to sign in or use the API until it is activated again.`
      : `Activate "${tenant.name}"?`;
    if (window.confirm(msg)) update(tenant, { status: next }, `${tenant.name} is ${next}`);
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tenants', form);
      notify.success('Tenant created');
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (error) {
      notify.error(errMsg(error, 'Could not create tenant'));
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  if (loading) return <div className="premium-loading">Loading tenants…</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Tenants</h1>
          <p>Every customer organization. Change a tenant&apos;s plan or suspend access.</p>
        </div>
        <button type="button" className="premium-btn premium-btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : '+ New Tenant'}
        </button>
      </div>

      {showForm && (
        <form className="glass-card" onSubmit={create} style={{ padding: '1rem', marginBottom: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <input placeholder="Company name" value={form.name} onChange={set('name')} required />
          <input placeholder="Slug (e.g. acme)" value={form.slug} onChange={set('slug')} required pattern="[a-z0-9-]+" title="lowercase letters, digits and dashes" />
          <select value={form.plan} onChange={set('plan')}>
            {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input placeholder="Admin name" value={form.adminName} onChange={set('adminName')} required />
          <input type="email" placeholder="Admin email" value={form.adminEmail} onChange={set('adminEmail')} required />
          <input type="password" placeholder="Admin password" value={form.adminPassword} onChange={set('adminPassword')} required minLength={6} autoComplete="new-password" />
          <button className="premium-btn premium-btn-primary" type="submit">Create Tenant</button>
        </form>
      )}

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr><th>Tenant</th><th>Plan</th><th>Status</th><th>Branches</th><th>Users</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr><td colSpan="6" className="empty-state">No tenants yet</td></tr>
              ) : tenants.map((t) => (
                <tr key={t.id}>
                  <td data-label="Tenant" style={{ fontWeight: 700 }}>{t.name} <small style={{ fontWeight: 400, opacity: 0.6 }}>({t.slug})</small></td>
                  <td data-label="Plan">
                    <select value={t.plan} onChange={(e) => changePlan(t, e.target.value)} aria-label={`Plan for ${t.name}`}>
                      {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </td>
                  <td data-label="Status">
                    <span className={`premium-badge ${t.status === 'active' ? 'premium-badge-success' : 'premium-badge-warning'}`}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td data-label="Branches">{t.branch_count}</td>
                  <td data-label="Users">{t.user_count}</td>
                  <td data-label="Actions">
                    <button type="button" className="premium-btn premium-btn-secondary" onClick={() => toggleStatus(t)}>
                      {t.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Tenants;
