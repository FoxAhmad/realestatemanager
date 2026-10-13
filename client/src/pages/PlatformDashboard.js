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
  const cards = [
    ['Tenants', tenants.length],
    ['Platinum', count((t) => t.plan === 'platinum')],
    ['Pro', count((t) => t.plan === 'pro')],
    ['Basic', count((t) => t.plan === 'basic')],
    ['Suspended', count((t) => t.status !== 'active')],
  ];

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Welcome back, {user?.name}</h1>
          <p>Platform overview. Manage organizations and their plans on the <Link to="/tenants">Tenants</Link> page.</p>
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
