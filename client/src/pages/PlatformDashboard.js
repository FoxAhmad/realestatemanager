import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Platform admin home: how many tenants, on which plans.
const PlatformDashboard = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState(null);

  useEffect(() => {
    api.get('/tenants').then((res) => setTenants(res.data)).catch(() => setTenants([]));
  }, []);

  if (!tenants) return <div className="premium-loading">Loading…</div>;

  const count = (fn) => tenants.filter(fn).length;
  // one card per plan actually in use, so new plans show up without code changes
  const byPlan = [...new Set(tenants.map((t) => t.plan_name || t.plan))].map((name) => [name, count((t) => (t.plan_name || t.plan) === name)]);
  const cards = [
    ['Tenants', tenants.length],
    ...byPlan,
    ['Expired / grace', count((t) => ['expired', 'grace'].includes(t.subscription_status))],
    ['Suspended', count((t) => t.status !== 'active' || t.subscription_status === 'suspended')],
  ];

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Welcome back, {user?.name}</h1>
          <p>Platform overview. Manage organizations on the <Link to="/tenants">Tenants</Link> page, plans on <Link to="/plans">Plans</Link> and billing on <Link to="/subscriptions">Subscriptions</Link>.</p>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {cards.map(([label, value]) => (
          <div className="glass-card" key={label} style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlatformDashboard;
