import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { notify, confirmDialog } from '../utils/notify';
import './Billing.css';

const errMsg = (error, fallback) => error.response?.data?.message || fallback;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : 'No expiry');
const money = (n, cur) => (n === null || n === undefined ? 'n/a' : `${cur === 'USD' ? '$' : 'Rs '}${Number(n).toLocaleString()}`);
const lim = (v) => (v === null || v === undefined ? 'Unlimited' : Number(v).toLocaleString());
const LIMIT_LABELS = { branches: 'Branches', users: 'Users', transactions_per_month: 'Transactions / month', storage_gb: 'Storage (GB)', api_requests: 'API requests / month' };
const FEATURE_LABELS = { multi_branch: 'Multi-branch', advanced_reports: 'Advanced reports', api_access: 'API access', priority_support: 'Priority support' };
const STATUS_BADGE = { active: 'premium-badge-success', trial: 'premium-badge-primary', grace: 'premium-badge-warning' };

// Posts a hosted-checkout form (JazzCash) so the browser lands on the provider's page.
const submitForm = ({ action, method = 'POST', fields }) => {
  const f = document.createElement('form');
  f.action = action;
  f.method = method;
  Object.entries(fields).forEach(([k, v]) => {
    const i = document.createElement('input');
    i.type = 'hidden'; i.name = k; i.value = v;
    f.appendChild(i);
  });
  document.body.appendChild(f);
  f.submit();
};

// Tenant admin: current plan, usage, payment method, and upgrade. Plans themselves can only be changed
// by the platform administrator.
const MyPlan = () => {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState('monthly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setData((await api.get('/subscription')).data);
    } catch (error) {
      notify.error(errMsg(error, 'Could not load your plan'));
    }
  }, []);

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);
    if (p.get('card') === 'added') notify.success('Card saved. It can take a few seconds to appear.');
    if (p.get('payment') === 'success') notify.success('Payment received. Your plan has been upgraded.');
    if (p.get('payment') === 'failed') notify.error('Payment was not completed. Your plan was not changed.');
    if (p.get('payment') === 'cancelled') notify.info('Payment cancelled.');
    if (p.toString()) window.history.replaceState({}, '', '/my-plan');
  }, [load]);

  const upgrade = async (plan) => {
    if (!(await confirmDialog(`Upgrade to ${plan.name} (${cycle})? You will be charged ${money(cycle === 'yearly' ? plan.yearly : plan.monthly, data.currency)}.`, { danger: false, confirmLabel: 'Upgrade' }))) return;
    setBusy(true);
    try {
      const { data: r } = await api.post('/subscription/upgrade', { plan: plan.code, cycle });
      if (r.status === 'succeeded') { notify.success(`You are now on ${plan.name}.`); await load(); }
      else if (r.form) submitForm(r.form);
      else if (r.redirectUrl) window.location.assign(r.redirectUrl);
    } catch (error) {
      notify.error(errMsg(error, 'Upgrade failed'));
    } finally {
      setBusy(false);
    }
  };

  const attach = async (provider) => {
    setBusy(true);
    try {
      const { data: r } = await api.post('/subscription/payment-method/setup', { provider });
      if (r.attached) { notify.success('Test card attached'); await load(); } else window.location.assign(r.url);
    } catch (error) {
      notify.error(errMsg(error, 'Could not start card setup'));
    } finally {
      setBusy(false);
    }
  };

  const removeMethod = async () => {
    if (!(await confirmDialog('Remove your payment method? You will not be able to upgrade yourself until you add one.', { confirmLabel: 'Remove' }))) return;
    try { await api.delete('/subscription/payment-method'); await load(); } catch (error) { notify.error(errMsg(error, 'Could not remove')); }
  };

  const requestUpgrade = async (planCode) => {
    try {
      await api.post('/subscription/upgrade-request', { plan: planCode, message });
      notify.success('Request sent to the administrator.');
      setMessage('');
    } catch (error) {
      notify.error(errMsg(error, 'Could not send the request'));
    }
  };

  if (!data) return <div className="premium-loading">Loading your plan…</div>;

  const providers = data.providers || {};
  const cardProviders = Object.entries(providers).filter(([, p]) => p.savesMethods && p.configured && p.currencies.includes(data.currency)).map(([n]) => n);

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>My Plan</h1>
          <p>Your subscription, usage and upgrade options.</p>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1rem', marginBottom: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{data.plan.name}</h2>
          <span className={`premium-badge ${STATUS_BADGE[data.status] || 'premium-badge-warning'}`}>{data.status.toUpperCase()}</span>
          <span style={{ opacity: 0.7 }}>{data.billingCycle} · {data.currency}</span>
        </div>
        <div>{data.status === 'trial' ? 'Trial ends' : 'Renews / ends'}: <strong>{fmtDate(data.endDate)}</strong></div>
        {!data.canWrite && <div className="premium-badge premium-badge-warning" style={{ whiteSpace: 'normal' }}>Your subscription is {data.status}: the app is read-only. {data.canSelfUpgrade ? 'Contact your administrator to renew.' : data.contact}</div>}

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {Object.keys(data.limits).map((k) => {
            const used = data.usage[k] || 0;
            const l = data.limits[k];
            const pct = l === null || l === 0 ? 0 : Math.min(100, Math.round((used / l) * 100));
            return (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>{LIMIT_LABELS[k] || k}</span><strong>{used.toLocaleString()} / {lim(l)}</strong>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 4 }}>
                  <div style={{ width: `${pct}%`, height: 6, borderRadius: 4, background: pct >= 90 ? '#c0392b' : 'var(--primary, #1a5632)' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <strong>Included:</strong>{' '}
          {data.features.length ? data.features.map((f) => FEATURE_LABELS[f] || f).join(' · ') : 'Core features'}
          {data.addons.length > 0 && <div style={{ opacity: 0.8 }}>Addons: {data.addons.map((a) => `${a.name} × ${a.quantity}`).join(', ')}</div>}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1rem', marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Payment method</h3>
        {data.paymentMethod ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{data.paymentMethod.brand ? `${data.paymentMethod.brand.toUpperCase()} •••• ${data.paymentMethod.last4}` : data.paymentMethod.label}</span>
            <small style={{ opacity: 0.7 }}>via {data.paymentMethod.provider}</small>
            <button type="button" className="premium-btn premium-btn-secondary" onClick={removeMethod}>Remove</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div>No payment method on file. You need one to upgrade by yourself.</div>
            {cardProviders.map((p) => (
              <div key={p}>
                <button type="button" className="premium-btn premium-btn-primary" disabled={busy} onClick={() => attach(p)}>
                  {p === 'fake' ? 'Add test card (development)' : 'Add a card'}
                </button>
              </div>
            ))}
            {data.currency === 'PKR' && <div style={{ opacity: 0.8 }}>For JazzCash / OPay payments, your administrator enables checkout for your account. {data.contact}</div>}
            {cardProviders.length === 0 && data.currency === 'USD' && <div style={{ opacity: 0.8 }}>Card payments are not available yet. {data.contact}</div>}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Upgrade</h3>
          <div className="ps-tabs" role="tablist" style={{ margin: 0 }}>
            {['monthly', 'yearly'].map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cycle === c} className={`ps-tab ${cycle === c ? 'active' : ''}`} onClick={() => setCycle(c)}>{c}</button>
            ))}
          </div>
        </div>

        {data.upgrades.length === 0 ? (
          <p style={{ opacity: 0.8 }}>You are on the highest plan available online. For anything else, {data.contact.toLowerCase()}</p>
        ) : (
          <>
            {!data.canSelfUpgrade && (
              <div className="premium-badge premium-badge-warning" style={{ whiteSpace: 'normal', margin: '10px 0' }}>
                To upgrade, add a payment method above or contact your system administrator. {data.contact}
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12 }}>
              {data.upgrades.map((p) => (
                <div key={p.code} className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <h4 style={{ margin: 0 }}>{p.name}</h4>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{money(cycle === 'yearly' ? p.yearly : p.monthly, data.currency)}<small style={{ fontWeight: 400 }}> / {cycle === 'yearly' ? 'year' : 'month'}</small></div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.8, margin: '6px 0' }}>{p.description}</div>
                  <ul style={{ paddingLeft: 18, fontSize: '0.9rem' }}>
                    {Object.entries(p.limits).filter(([k]) => ['branches', 'users'].includes(k)).map(([k, v]) => <li key={k}>{lim(v)} {LIMIT_LABELS[k].toLowerCase()}</li>)}
                    {p.features.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                  {data.canSelfUpgrade ? (
                    <button type="button" className="premium-btn premium-btn-primary" disabled={busy || !(cycle === 'yearly' ? p.yearly : p.monthly)} onClick={() => upgrade(p)}>Upgrade to {p.name}</button>
                  ) : (
                    <button type="button" className="premium-btn premium-btn-secondary" onClick={() => requestUpgrade(p.code)}>Request this plan</button>
                  )}
                </div>
              ))}
            </div>
            {!data.canSelfUpgrade && (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Message to the administrator (optional)</label>
                <input value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyPlan;
