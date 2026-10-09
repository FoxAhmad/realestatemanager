import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const BrandMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 28 28">
      <path d="M5 5h18v18H5zM14 5v18M5 14h18" />
      <path className="fill" d="M8 8h3v3H8z" />
    </svg>
  </span>
);

const LINE = [38, 52, 45, 64, 58, 78, 70, 92, 86, 104, 98, 120];
const BARS = [22, 30, 26, 38, 34, 46, 42, 56, 52, 62, 58, 70];
const CHART_W = 340;
const CHART_H = 130;

// Smooth path through the points (Catmull-Rom converted to cubic Béziers).
const smoothPath = (pts) => {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
};

const CollectionsChart = () => {
  const { line, area, bars, end } = useMemo(() => {
    const step = CHART_W / (LINE.length - 1);
    const pts = LINE.map((v, i) => [i * step, CHART_H - v]);
    const l = smoothPath(pts);
    const barW = 14;
    return {
      line: l,
      area: `${l} L${CHART_W},${CHART_H} L0,${CHART_H} Z`,
      bars: BARS.map((v, i) => ({ x: i * step - barW / 2, h: v, w: barW })),
      end: pts[pts.length - 1],
    };
  }, []);

  return (
    <div className="brand-visual" aria-hidden="true">
      <div className="chart-card">
        <div className="chart-head">
          <span className="chart-label">Your collections, at a glance</span>
        </div>

        <svg className="chart-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} className="chart-grid" x1="0" x2={CHART_W} y1={CHART_H * r} y2={CHART_H * r} />
          ))}
          {bars.map((b, i) => (
            <rect
              key={b.x}
              className="chart-bar"
              style={{ '--i': i }}
              x={b.x}
              y={CHART_H - b.h}
              width={b.w}
              height={b.h}
              rx="3"
            />
          ))}
          <path className="chart-area" d={area} fill="url(#chartArea)" />
          <path className="chart-line" d={line} pathLength="1" />
          <circle className="chart-ping" cx={end[0] - 2} cy={end[1]} r="5" />
          <circle className="chart-dot" cx={end[0] - 2} cy={end[1]} r="4" />
        </svg>
      </div>
    </div>
  );
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Authentication failed');
    }
  };

  return (
    <div className="login-container">
      <aside className="login-brand">
        <div className="brand-lockup">
          <BrandMark />
          <span>Plot Ledge</span>
        </div>

        <div className="brand-pitch">
          <h2>Every plot, every payment, <em>on the ledger.</em></h2>
          <p>Manage inventory, deals, installments and accounts for your housing projects in one place.</p>
          <ul className="brand-points">
            <li>Plot inventory and deal tracking</li>
            <li>Installments, receipts and forms ledger</li>
            <li>Accounting and balance reports</li>
          </ul>
        </div>

        <CollectionsChart />
      </aside>

      <main className="login-panel">
        <div className="login-card">
          <div className="login-mobile-brand">
            <BrandMark />
            <span>Plot Ledge</span>
          </div>

          <h1>Welcome back</h1>
          <p className="login-sub">Sign in to your Plot Ledge workspace.</p>

          {error && <div className="error-message" role="alert">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Work email</label>
              <input
                type="email"
                id="email"
                placeholder="name@company.com"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group password-wrap">
              <label htmlFor="password">Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-footer">
            <p>© 2026 Plot Ledge · Secured environment</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
