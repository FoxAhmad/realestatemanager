import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify } from '../utils/notify';
import './Billing.css';

const errMsg = (error, fallback) => error.response?.data?.message || fallback;
const CURRENCIES = ['PKR', 'USD'];
const priceOf = (plan, cur, field) => (plan.prices.find((p) => p.currency === cur) || {})[field] ?? 0;
const fmtLimit = (v) => (v === null || v === undefined ? 'Unlimited' : v);

// Super admin: plans (prices, features, limits) and addons. Tenants never see this page.
const Plans = () => {
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState({ features: [], limits: [] });
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({ code: '', name: '', description: '' });
  const [newAddon, setNewAddon] = useState({ code: '', name: '', effect_type: 'limit', limit_code: 'users', amount: 1, pkr: 0, usd: 0 });

  const load = useCallback(async () => {
    try {
      const [p, f, a] = await Promise.all([api.get('/plans'), api.get('/features'), api.get('/addons')]);
      setPlans(p.data);
      setCatalog(f.data);
      setAddons(a.data);
    } catch (error) {
      notify.error(errMsg(error, 'Could not load plans'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) notify.success(okMsg);
      await load();
      return r;
    } catch (error) {
      notify.error(errMsg(error, 'Request failed'));
      return null;
    }
  };

  const openEdit = (plan) => {
    setEditId(plan.id);
    setDraft({
      name: plan.name, description: plan.description || '', trial_days: plan.trial_days, is_active: plan.is_active,
      prices: Object.fromEntries(CURRENCIES.map((c) => [c, { monthly_price: priceOf(plan, c, 'monthly_price'), yearly_price: priceOf(plan, c, 'yearly_price') }])),
      features: { ...plan.features },
      limits: { ...plan.limits },
    });
  };

  const saveAll = async () => {
    await run(async () => {
      await api.put(`/plans/${editId}`, { name: draft.name, description: draft.description, trial_days: draft.trial_days, is_active: draft.is_active });
      await api.put(`/plans/${editId}/prices`, { prices: CURRENCIES.map((c) => ({ currency: c, ...draft.prices[c] })) });
      await api.put(`/plans/${editId}/features`, { features: draft.features });
      await api.put(`/plans/${editId}/limits`, { limits: draft.limits });
    }, 'Plan saved');
  };

  const createPlan = async (e) => {
    e.preventDefault();
    const r = await run(() => api.post('/plans', newPlan), 'Plan created. Configure its features, limits and prices.');
    if (r) { setNewPlan({ code: '', name: '', description: '' }); setShowNew(false); setEditId(null); }
  };

  const clone = (plan) => {
    const code = window.prompt('Code for the copy (lowercase letters, digits, underscore)', `${plan.code}_copy`);
    if (code) run(() => api.post(`/plans/${plan.id}/clone`, { code, name: `${plan.name} (copy)` }), 'Plan cloned');
  };

  const createAddon = async (e) => {
    e.preventDefault();
    const body = {
      code: newAddon.code, name: newAddon.name, effect_type: newAddon.effect_type,
      limit_code: newAddon.effect_type === 'limit' ? newAddon.limit_code : undefined, amount: Number(newAddon.amount),
      prices: [{ currency: 'PKR', monthly_price: Number(newAddon.pkr) }, { currency: 'USD', monthly_price: Number(newAddon.usd) }],
    };
    const r = await run(() => api.post('/addons', body), 'Addon created');
    if (r) setNewAddon({ code: '', name: '', effect_type: 'limit', limit_code: 'users', amount: 1, pkr: 0, usd: 0 });
  };

  if (loading) return <div className="premium-loading">Loading plans…</div>;

  const editing = plans.find((p) => p.id === editId);

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Plans &amp; Addons</h1>
          <p>Define what each plan includes. Tenants only see the result on their My Plan page.</p>
        </div>
        {tab === 'plans' && (
          <button type="button" className="premium-btn premium-btn-primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Close' : '+ New Plan'}
          </button>
        )}
      </div>

      <div className="ps-tabs" role="tablist">
        {['plans', 'addons'].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`ps-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'plans' ? 'Plans' : 'Addons'}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        <>
          {showNew && (
            <form className="glass-card form-grid" onSubmit={createPlan}>
              <div className="form-group">
                <label>Code * (e.g. enterprise)</label>
                <input value={newPlan.code} onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })} required pattern="[a-z0-9_]{2,50}" title="lowercase letters, digits, underscore" />
              </div>
              <div className="form-group">
                <label>Plan Name *</label>
                <input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} />
              </div>
              <div className="form-actions">
                <button className="premium-btn premium-btn-primary" type="submit">Create Plan</button>
              </div>
            </form>
          )}

          <div className="glass-card">
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr><th>Plan</th><th>Status</th><th>Tenants</th><th>Branches</th><th>Users</th><th>PKR / month</th><th>USD / month</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Plan" style={{ fontWeight: 700 }}>
                        {p.name} <small style={{ fontWeight: 400, opacity: 0.6 }}>({p.code})</small>
                        {p.is_custom && <span className="premium-badge premium-badge-warning" style={{ marginLeft: 6 }}>CUSTOM</span>}
                      </td>
                      <td data-label="Status">
                        <span className={`premium-badge ${p.is_active ? 'premium-badge-success' : 'premium-badge-warning'}`}>{p.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                      </td>
                      <td data-label="Tenants">{p.tenant_count}</td>
                      <td data-label="Branches">{fmtLimit(p.limits.branches)}</td>
                      <td data-label="Users">{fmtLimit(p.limits.users)}</td>
                      <td data-label="PKR / month">{priceOf(p, 'PKR', 'monthly_price').toLocaleString()}</td>
                      <td data-label="USD / month">{priceOf(p, 'USD', 'monthly_price').toLocaleString()}</td>
                      <td data-label="Actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="premium-btn premium-btn-secondary" onClick={() => openEdit(p)}>Edit</button>
                        <button type="button" className="premium-btn premium-btn-secondary" onClick={() => clone(p)}>Clone</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {editing && draft && (
            <div className="glass-card form-stack" style={{ padding: '1.25rem', marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>Edit {editing.name}</h3>

              <div className="form-grid" style={{ padding: 0, marginBottom: 0 }}>
                <div className="form-group">
                  <label>Plan Name</label>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Trial Days</label>
                  <input type="number" min="0" value={draft.trial_days} onChange={(e) => setDraft({ ...draft, trial_days: e.target.value })} />
                </div>
                <label className="ff-check">
                  <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Plan is active (can be assigned)
                </label>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px' }}>Prices</h4>
                <div className="form-grid" style={{ padding: 0, marginBottom: 0 }}>
                  {CURRENCIES.map((c) => ['monthly_price', 'yearly_price'].map((f) => (
                    <div className="form-group" key={`${c}${f}`}>
                      <label>{c} {f === 'monthly_price' ? 'Monthly' : 'Yearly'} Price</label>
                      <input type="number" min="0" value={draft.prices[c][f]}
                        onChange={(e) => setDraft({ ...draft, prices: { ...draft.prices, [c]: { ...draft.prices[c], [f]: e.target.value } } })} />
                    </div>
                  )))}
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px' }}>Features</h4>
                {catalog.features.map((f) => (
                  <label key={f.code} style={{ display: 'block', margin: '4px 0' }}>
                    <input type="checkbox" checked={!!draft.features[f.code]} onChange={(e) => setDraft({ ...draft, features: { ...draft.features, [f.code]: e.target.checked } })} />{' '}
                    {f.name} <small style={{ opacity: 0.6 }}>{f.description}</small>
                  </label>
                ))}
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px' }}>Limits</h4>
                <div className="form-grid" style={{ padding: 0, marginBottom: 0 }}>
                  {catalog.limits.map((l) => {
                    const unlimited = draft.limits[l.code] === null || draft.limits[l.code] === undefined;
                    return (
                      <div key={l.code} className="limit-field">
                        <div className="form-group">
                          <label>{l.name} ({l.unit})</label>
                          <input type="number" min="0" disabled={unlimited} value={unlimited ? '' : draft.limits[l.code]}
                            onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [l.code]: e.target.value === '' ? 0 : Number(e.target.value) } })} />
                        </div>
                        <label className="ff-check" style={{ minHeight: 'auto', marginTop: 6, fontSize: '0.85rem' }}>
                          <input type="checkbox" checked={unlimited} onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [l.code]: e.target.checked ? null : 0 } })} /> Unlimited
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="premium-btn premium-btn-primary" onClick={saveAll}>Save plan</button>
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => { setEditId(null); setDraft(null); }}>Close</button>
              </div>
              <small style={{ opacity: 0.7 }}>Changes apply to every tenant on this plan immediately. Lowering a limit never deletes data: it only blocks new records and freezes extra branches as read-only.</small>
            </div>
          )}
        </>
      )}

      {tab === 'addons' && (
        <>
          <form className="glass-card form-grid" onSubmit={createAddon}>
            <div className="form-group">
              <label>Code *</label>
              <input value={newAddon.code} onChange={(e) => setNewAddon({ ...newAddon, code: e.target.value })} required pattern="[a-z0-9_]{2,50}" title="lowercase letters, digits, underscore" />
            </div>
            <div className="form-group">
              <label>Addon Name *</label>
              <input value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Effect *</label>
              <select value={newAddon.effect_type} onChange={(e) => setNewAddon({ ...newAddon, effect_type: e.target.value })}>
                <option value="limit">Raises a limit</option>
                <option value="custom">Custom (manual)</option>
              </select>
            </div>
            {newAddon.effect_type === 'limit' && (
              <>
                <div className="form-group">
                  <label>Limit</label>
                  <select value={newAddon.limit_code} onChange={(e) => setNewAddon({ ...newAddon, limit_code: e.target.value })}>
                    {catalog.limits.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount Per Unit</label>
                  <input type="number" min="1" value={newAddon.amount} onChange={(e) => setNewAddon({ ...newAddon, amount: e.target.value })} />
                </div>
              </>
            )}
            <div className="form-group">
              <label>PKR / Month</label>
              <input type="number" min="0" value={newAddon.pkr} onChange={(e) => setNewAddon({ ...newAddon, pkr: e.target.value })} />
            </div>
            <div className="form-group">
              <label>USD / Month</label>
              <input type="number" min="0" value={newAddon.usd} onChange={(e) => setNewAddon({ ...newAddon, usd: e.target.value })} />
            </div>
            <div className="form-actions">
              <button className="premium-btn premium-btn-primary" type="submit">Add Addon</button>
            </div>
          </form>
          <div className="glass-card">
            <div className="premium-table-container">
              <table className="premium-table">
                <thead><tr><th>Addon</th><th>Effect</th><th>PKR / month</th><th>USD / month</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {addons.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Addon" style={{ fontWeight: 700 }}>{a.name} <small style={{ fontWeight: 400, opacity: 0.6 }}>({a.code})</small></td>
                      <td data-label="Effect">{a.effect_type === 'limit' ? `+${a.amount} ${a.limit_code} per unit` : a.effect_type}</td>
                      <td data-label="PKR / month">{(a.prices.find((p) => p.currency === 'PKR') || {}).monthly_price}</td>
                      <td data-label="USD / month">{(a.prices.find((p) => p.currency === 'USD') || {}).monthly_price}</td>
                      <td data-label="Status"><span className={`premium-badge ${a.is_active ? 'premium-badge-success' : 'premium-badge-warning'}`}>{a.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                      <td data-label="Actions">
                        <button type="button" className="premium-btn premium-btn-secondary" onClick={() => run(() => api.put(`/addons/${a.id}`, { is_active: !a.is_active }))}>
                          {a.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Plans;
