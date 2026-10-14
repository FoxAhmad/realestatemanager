import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify, confirmDialog } from '../utils/notify';
import './Billing.css';

const errMsg = (error, fallback) => error.response?.data?.message || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : 'Never');
const STATUS_BADGE = {
  active: 'premium-badge-success', trial: 'premium-badge-primary', grace: 'premium-badge-warning',
  expired: 'premium-badge-warning', suspended: 'premium-badge-warning', cancelled: 'premium-badge-warning',
};
const TABS = [['all', 'All subscriptions'], ['expiring', 'Expiring & expired'], ['requests', 'Upgrade requests'], ['reports', 'Reports']];

// Super admin: monitor and manage every tenant's subscription.
const Subscriptions = () => {
  const [tab, setTab] = useState('all');
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [requests, setRequests] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [addonCode, setAddonCode] = useState('');
  const [addonQty, setAddonQty] = useState(1);

  const load = useCallback(async () => {
    try {
      const [s, p, a, e, r, rep] = await Promise.all([
        api.get('/subscriptions'), api.get('/plans'), api.get('/addons'), api.get('/subscriptions/expiring'),
        api.get('/subscriptions/upgrade-requests'), api.get('/subscriptions/report'),
      ]);
      setSubs(s.data); setPlans(p.data); setAddons(a.data.filter((x) => x.is_active)); setExpiring(e.data); setRequests(r.data); setReport(rep.data);
    } catch (error) {
      notify.error(errMsg(error, 'Could not load subscriptions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (tenantId) => {
    try {
      const { data } = await api.get(`/subscriptions/${tenantId}`);
      setDetail({ tenantId, ...data });
    } catch (error) {
      notify.error(errMsg(error, 'Could not load details'));
    }
  };

  const act = async (tenantId, path, body, okMsg, refreshDetail = false) => {
    try {
      const { data } = await api.post(`/subscriptions/${tenantId}/${path}`, body || {});
      if (data && data.warnings && data.warnings.length) {
        notify.info(`Plan changed. Over the new limits: ${data.warnings.map((w) => `${w.limit} ${w.used}/${w.allowed}`).join(', ')}. Nothing was deleted; extra branches are now read-only.`);
      } else notify.success(okMsg);
      await load();
      if (refreshDetail) await openDetail(tenantId);
    } catch (error) {
      notify.error(errMsg(error, 'Action failed'));
    }
  };

  const confirmAct = async (msg, ...args) => { if (await confirmDialog(msg, { danger: false, confirmLabel: 'Confirm' })) act(...args); };

  if (loading) return <div className="premium-loading">Loading subscriptions…</div>;

  const table = (rows, withActions) => (
    <div className="glass-card">
      <div className="premium-table-container">
        <table className="premium-table">
          <thead>
            <tr><th>Tenant</th><th>Plan</th><th>Status</th><th>Ends</th><th>Billing</th><th>Payment</th>{withActions && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={withActions ? 7 : 6} className="empty-state">Nothing here</td></tr>
            ) : rows.map((s) => (
              <tr key={s.tenant_id}>
                <td data-label="Tenant" style={{ fontWeight: 700 }}>
                  <button type="button" className="premium-btn premium-btn-secondary" style={{ padding: '2px 8px' }} onClick={() => openDetail(s.tenant_id)}>{s.tenant_name}</button>
                  {s.open_requests > 0 && <span className="premium-badge premium-badge-primary" style={{ marginLeft: 6 }}>REQUEST</span>}
                </td>
                <td data-label="Plan">
                  {withActions ? (
                    <select className="ff-inline" value={s.plan_code} onChange={(e) => confirmAct(`Move ${s.tenant_name} to ${e.target.value}?`, s.tenant_id, 'change-plan', { plan: e.target.value }, 'Plan changed')} aria-label={`Plan for ${s.tenant_name}`}>
                      {plans.filter((p) => p.is_active || p.code === s.plan_code).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                  ) : s.plan_name}
                </td>
                <td data-label="Status"><span className={`premium-badge ${STATUS_BADGE[s.status] || ''}`}>{s.status.toUpperCase()}</span></td>
                <td data-label="Ends">{fmtDate(s.end_date)}</td>
                <td data-label="Billing">{s.billing_cycle} · {s.currency}</td>
                <td data-label="Payment">{s.has_payment_method ? (s.provider || 'method on file') : 'none'}</td>
                {withActions && (
                  <td data-label="Actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="premium-btn premium-btn-secondary" onClick={() => act(s.tenant_id, 'renew', {}, 'Renewed')}>Renew</button>
                    {['cancelled', 'suspended', 'expired'].includes(s.status)
                      ? <button type="button" className="premium-btn premium-btn-secondary" onClick={() => act(s.tenant_id, 'reactivate', {}, 'Reactivated')}>Reactivate</button>
                      : (
                        <>
                          <button type="button" className="premium-btn premium-btn-secondary" onClick={() => confirmAct(`Suspend ${s.tenant_name}? They keep read-only access.`, s.tenant_id, 'suspend', {}, 'Suspended')}>Suspend</button>
                          <button type="button" className="premium-btn premium-btn-secondary" onClick={() => confirmAct(`Cancel ${s.tenant_name}'s subscription?`, s.tenant_id, 'cancel', {}, 'Cancelled')}>Cancel</button>
                        </>
                      )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Subscriptions</h1>
          <p>Monitor, renew, upgrade or downgrade any tenant. Only platform admins can do this.</p>
        </div>
      </div>

      <div className="ps-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ps-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'requests' && requests.filter((r) => r.status === 'open').length > 0 && <span className="ps-count">{requests.filter((r) => r.status === 'open').length}</span>}
            {id === 'expiring' && expiring.length > 0 && <span className="ps-count warn">{expiring.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'all' && table(subs, true)}
      {tab === 'expiring' && table(subs.filter((s) => expiring.some((e) => e.tenant_id === s.tenant_id)), true)}

      {tab === 'requests' && (
        <div className="glass-card">
          <div className="premium-table-container">
            <table className="premium-table">
              <thead><tr><th>Tenant</th><th>Wants</th><th>Message</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {requests.length === 0 ? <tr><td colSpan="6" className="empty-state">No requests</td></tr> : requests.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Tenant" style={{ fontWeight: 700 }}>{r.tenant_name}</td>
                    <td data-label="Wants">{r.plan_name || '-'}</td>
                    <td data-label="Message">{r.message || '-'}</td>
                    <td data-label="Date">{fmtDate(r.created_at)}</td>
                    <td data-label="Status"><span className={`premium-badge ${r.status === 'open' ? 'premium-badge-primary' : 'premium-badge-success'}`}>{r.status.toUpperCase()}</span></td>
                    <td data-label="Actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="premium-btn premium-btn-secondary" onClick={() => openDetail(r.tenant_id)}>Open tenant</button>
                      {r.status === 'open' && (
                        <button type="button" className="premium-btn premium-btn-secondary" onClick={async () => { await api.post(`/subscriptions/upgrade-requests/${r.id}/close`); load(); }}>Close</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reports' && report && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Tenants by plan</h3>
            {report.byPlan.map((r) => <div key={r.plan} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{r.plan}</span><strong>{r.tenants}</strong></div>)}
          </div>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>By status</h3>
            {report.byStatus.map((r) => <div key={r.status} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{r.status}</span><strong>{r.tenants}</strong></div>)}
            <div style={{ marginTop: 8, opacity: 0.8 }}>Expiring in 14 days: <strong>{report.expiringSoon}</strong></div>
          </div>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Revenue (verified payments)</h3>
            {report.revenue.length === 0 ? <div style={{ opacity: 0.7 }}>No payments yet</div> : report.revenue.map((r) => (
              <div key={`${r.provider}${r.currency}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{r.provider} ({r.currency})</span><strong>{Number(r.total).toLocaleString()} · {r.payments}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail && (
        <div className="glass-card" style={{ padding: '1rem', marginTop: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{(subs.find((s) => s.tenant_id === detail.tenantId) || {}).tenant_name}: {detail.subscription.plan_name}</h3>
            <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setDetail(null)}>Close</button>
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>Usage</h4>
            {['branches', 'users', 'transactions_per_month'].map((k) => (
              <div key={k}>{k.replace(/_/g, ' ')}: <strong>{detail.usage[k]}</strong> / {detail.limits[k] === null || detail.limits[k] === undefined ? 'Unlimited' : detail.limits[k]}</div>
            ))}
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>Payment method</h4>
            {detail.paymentMethod
              ? <div>{detail.paymentMethod.provider}: {detail.paymentMethod.brand ? `${detail.paymentMethod.brand} •••• ${detail.paymentMethod.last4}` : detail.paymentMethod.label}</div>
              : <div style={{ opacity: 0.7 }}>None. The tenant cannot self-upgrade.</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {['jazzcash', 'opay'].map((p) => (
                <button key={p} type="button" className="premium-btn premium-btn-secondary" onClick={() => act(detail.tenantId, 'payment-method/enable', { provider: p }, `${p} enabled`, true)}>
                  Enable {p === 'jazzcash' ? 'JazzCash' : 'OPay'} checkout
                </button>
              ))}
              {detail.paymentMethod && (
                <button type="button" className="premium-btn premium-btn-secondary" onClick={async () => { await api.delete(`/subscriptions/${detail.tenantId}/payment-method`); notify.success('Removed'); load(); openDetail(detail.tenantId); }}>Remove</button>
              )}
            </div>
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>Addons</h4>
            {detail.addons.length === 0 && <div style={{ opacity: 0.7 }}>None</div>}
            {detail.addons.map((a) => (
              <div key={a.id}>{a.name} × {a.quantity}{' '}
                <button type="button" className="premium-btn premium-btn-secondary" style={{ padding: '0 8px' }}
                  onClick={async () => { await api.delete(`/subscriptions/${detail.tenantId}/addons/${a.id}`); load(); openDetail(detail.tenantId); }}>Remove</button>
              </div>
            ))}
            <div className="form-grid" style={{ padding: '0.75rem 0 0', marginBottom: 0 }}>
              <div className="form-group">
                <label>Addon</label>
                <select value={addonCode} onChange={(e) => setAddonCode(e.target.value)}>
                  <option value="" />
                  {addons.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min="1" value={addonQty} onChange={(e) => setAddonQty(e.target.value)} />
              </div>
              <div className="form-actions">
                <button type="button" className="premium-btn premium-btn-secondary" disabled={!addonCode}
                  onClick={() => act(detail.tenantId, 'addons', { addon: addonCode, quantity: Number(addonQty) }, 'Addon added', true)}>Add addon</button>
              </div>
            </div>
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>History</h4>
            {detail.history.length === 0 && <div style={{ opacity: 0.7 }}>No changes yet</div>}
            {detail.history.map((h) => (
              <div key={h.id} style={{ fontSize: '0.9rem' }}>
                {new Date(h.created_at).toLocaleString()} · <strong>{h.action.replace(/_/g, ' ')}</strong>
                {h.from_plan && h.to_plan && h.from_plan !== h.to_plan ? ` · ${h.from_plan} → ${h.to_plan}` : ''} <small style={{ opacity: 0.6 }}>({h.actor_role})</small>
              </div>
            ))}
          </div>
          <div>
            <h4 style={{ margin: '0 0 6px' }}>Payments</h4>
            {detail.transactions.length === 0 && <div style={{ opacity: 0.7 }}>None</div>}
            {detail.transactions.map((t) => (
              <div key={t.reference} style={{ fontSize: '0.9rem' }}>{new Date(t.created_at).toLocaleDateString()} · {t.provider} · {Number(t.amount).toLocaleString()} {t.currency} · {t.kind} · <strong>{t.status}</strong></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
