import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify, confirmDialog } from '../utils/notify';
import './Billing.css';

const EMPTY = { name: '', slug: '', plan: 'basic', currency: 'PKR', trial: false, adminName: '', adminEmail: '', adminPassword: '' };
const errMsg = (error, fallback) => error.response?.data?.message || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : 'No expiry');

// Platform admin (super_admin) only: every tenant, change its plan or status, create a new tenant.
// Renewals, addons, payment methods and history live on the Subscriptions page.
const Tenants = () => {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.get('/tenants'), api.get('/plans')]);
      setTenants(t.data);
      setPlans(p.data);
    } catch (error) {
      notify.error(errMsg(error, 'Could not load tenants'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (tenant, patch, okMsg) => {
    try {
      const { data } = await api.put(`/tenants/${tenant.id}`, patch);
      if (data.warnings && data.warnings.length) {
        notify.info(`${okMsg}. Over the new limits: ${data.warnings.map((w) => `${w.limit} ${w.used}/${w.allowed}`).join(', ')}. Nothing was deleted; extra branches are read-only.`);
      } else {
        notify.success(okMsg);
      }
      await load();
    } catch (error) {
      notify.error(errMsg(error, 'Update failed'));
    }
  };

  const changePlan = async (tenant, plan) => {
    if (plan === tenant.plan) return;
    const msg = `Change "${tenant.name}" to the ${plan} plan? No data is deleted. If the new plan has lower limits, new records are blocked and extra branches become read-only.`;
    if (await confirmDialog(msg, { danger: false, confirmLabel: 'Change plan' })) update(tenant, { plan }, `${tenant.name} is now on ${plan}`);
  };

  const toggleStatus = async (tenant) => {
    const next = tenant.status === 'active' ? 'suspended' : 'active';
    const msg = next === 'suspended'
      ? `Suspend "${tenant.name}"? Nobody in this tenant will be able to sign in or use the API until it is activated again.`
      : `Activate "${tenant.name}"?`;
    if (await confirmDialog(msg, { danger: next === 'suspended', confirmLabel: next === 'suspended' ? 'Suspend' : 'Activate' })) {
      update(tenant, { status: next }, `${tenant.name} is ${next}`);
    }
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
  const planOptions = plans.filter((p) => p.is_active);

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
        <form className="glass-card form-grid" onSubmit={create}>
          <div className="form-group">
            <label>Company Name *</label>
            <input value={form.name} onChange={set('name')} required />
          </div>
          <div className="form-group">
            <label>Slug * (e.g. acme)</label>
            <input value={form.slug} onChange={set('slug')} required pattern="[a-z0-9-]+" title="lowercase letters, digits and dashes" />
          </div>
          <div className="form-group">
            <label>Plan *</label>
            <select value={form.plan} onChange={set('plan')}>
              {planOptions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Billing Currency *</label>
            <select value={form.currency} onChange={set('currency')}>
              <option value="PKR">PKR (JazzCash / OPay)</option>
              <option value="USD">USD (Stripe)</option>
            </select>
          </div>
          <label className="ff-check">
            <input type="checkbox" checked={form.trial} onChange={(e) => setForm({ ...form, trial: e.target.checked })} /> Start with the plan&apos;s free trial
          </label>
          <div className="form-group">
            <label>Admin Name *</label>
            <input value={form.adminName} onChange={set('adminName')} required />
          </div>
          <div className="form-group">
            <label>Admin Email *</label>
            <input type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
          </div>
          <div className="form-group">
            <label>Admin Password *</label>
            <input type="password" value={form.adminPassword} onChange={set('adminPassword')} required minLength={6} autoComplete="new-password" />
          </div>
          <div className="form-actions">
            <button className="premium-btn premium-btn-primary" type="submit">Create Tenant</button>
          </div>
        </form>
      )}

      <div className="glass-card">
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr><th>Tenant</th><th>Plan</th><th>Subscription</th><th>Account</th><th>Branches</th><th>Users</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr><td colSpan="7" className="empty-state">No tenants yet</td></tr>
              ) : tenants.map((t) => (
                <tr key={t.id}>
                  <td data-label="Tenant" style={{ fontWeight: 700 }}>{t.name} <small style={{ fontWeight: 400, opacity: 0.6 }}>({t.slug})</small></td>
                  <td data-label="Plan">
                    <select className="ff-inline" value={t.plan} onChange={(e) => changePlan(t, e.target.value)} aria-label={`Plan for ${t.name}`}>
                      {plans.filter((p) => p.is_active || p.code === t.plan).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                  </td>
                  <td data-label="Subscription">{(t.subscription_status || 'none')} <small style={{ opacity: 0.6 }}>· {fmtDate(t.end_date)}</small></td>
                  <td data-label="Account">
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
