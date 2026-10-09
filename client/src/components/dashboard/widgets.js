import React, { useEffect, useMemo, useRef, useState } from 'react';
import './widgets.css';

/* ------------------------------------------------------------------ helpers */

export const formatMoney = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// True once the element has scrolled into view (immediately without IntersectionObserver / for reduced motion).
export const useInView = () => {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return undefined;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [seen]);
  return [ref, seen];
};

export const CountUp = ({ value, decimals = 0, prefix = '', suffix = '', duration = 1200 }) => {
  const [shown, setShown] = useState(0);
  const [ref, seen] = useInView();
  useEffect(() => {
    if (!seen) return undefined;
    if (prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
};

const smooth = (pts) => {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
};

let gradientSeq = 0;
const useGradientId = () => useMemo(() => `wg-${(gradientSeq += 1)}`, []);

/* ---------------------------------------------------------------- Sparkline */

export const Sparkline = ({ data, color = 'var(--chart-1)' }) => {
  const [ref, seen] = useInView();
  const gid = useGradientId();
  const W = 120;
  const H = 36;
  const pad = 3;
  const min = Math.min(...data);
  const span = Math.max(...data) - min || 1;
  const pts = data.map((v, i) => [
    pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2),
    H - pad - ((v - min) / span) * (H - pad * 2),
  ]);
  const line = data.length > 1 ? smooth(pts) : `M0,${H / 2} L${W},${H / 2}`;
  const last = pts[pts.length - 1];
  return (
    <svg ref={ref} className={`wg-spark ${seen ? 'in' : ''}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="wg-spark-area" d={`${line} L${last[0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${gid})`} />
      <path className="wg-spark-line" d={line} pathLength="1" stroke={color} />
    </svg>
  );
};

/* ---------------------------------------------------------------- StatusBadge */

const BADGES = {
  paid: ['Paid', 'paid'],
  pending: ['Pending', 'pending'],
  overdue: ['Overdue', 'overdue'],
  progress: ['In progress', 'pending'],
  done: ['Completed', 'paid'],
  cancelled: ['Cancelled', 'overdue'],
};

export const StatusBadge = ({ status, label }) => {
  const [text, tone] = BADGES[status] || [status, 'pending'];
  return (
    <span className={`wg-badge wg-badge-${tone}`}>
      <span className="wg-badge-dot" />
      {label || text}
    </span>
  );
};

/* ------------------------------------------------------------------ FillBar */

export const FillBar = ({ pct, color = 'var(--chart-1)' }) => {
  const [ref, seen] = useInView();
  return (
    <div ref={ref} className="wg-fill" aria-hidden="true">
      <div className={`wg-fill-bar ${seen ? 'in' : ''}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
};

/* ------------------------------------------------------------------ KpiCard */

export const KpiCard = ({ label, value, decimals = 0, prefix = '', suffix = '', delta, deltaLabel, upIsGood = true, spark, note, icon }) => {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const up = hasDelta && delta >= 0;
  const good = up === upIsGood;
  return (
    <div className="wg-card wg-kpi">
      <div className="wg-kpi-top">
        <span className="wg-kpi-label">{label}</span>
        {icon && <span className="wg-kpi-icon">{icon}</span>}
      </div>
      <div className="wg-kpi-value">
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      <div className="wg-kpi-meta">
        {hasDelta && (
          <span className={`wg-delta ${good ? 'good' : 'bad'}`}>
            {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {(deltaLabel || note) && <span className="wg-kpi-note">{deltaLabel || note}</span>}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} color={hasDelta && !good ? 'var(--overdue)' : 'var(--chart-1)'} />}
    </div>
  );
};

/* ---------------------------------------------------------------- ChartFrame */

export const ChartFrame = ({ title, subtitle, legend, children, className = '' }) => (
  <div className={`wg-card wg-frame ${className}`}>
    <div className="wg-frame-head">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
    <div className="wg-frame-body">{children}</div>
    {legend && (
      <ul className="wg-legend">
        {legend.map((l) => (
          <li key={l.label}>
            <span className="wg-swatch" style={{ background: l.color }} />
            {l.label}
            {l.value !== undefined && <strong>{l.value}</strong>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

/* --------------------------------------------------------- CollectionsTrend */

export const CollectionsTrend = ({ labels, values }) => {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);
  const gid = useGradientId();
  const W = 560;
  const H = 240;
  const P = { l: 46, r: 16, t: 20, b: 30 };
  const max = niceMax(Math.max(...values, 1));
  const x = (i) => P.l + (i / Math.max(values.length - 1, 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = values.length > 1 ? smooth(pts) : `M${P.l},${y(0)}`;
  const area = `${line} L${x(values.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => max * r);

  return (
    <div ref={ref} className={`wg-chart ${seen ? 'in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Collections per month">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wg-grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="wg-axis">{t === 0 ? '0' : formatMoney(t)}</text>
          </g>
        ))}
        {labels.map((m, i) => (
          <text key={m + i} x={x(i)} y={H - 8} textAnchor="middle" className="wg-axis">{m}</text>
        ))}
        <path className="wg-area" d={area} fill={`url(#${gid})`} />
        <path className="wg-line" d={line} pathLength="1" />
        {active !== null && <line x1={pts[active][0]} x2={pts[active][0]} y1={P.t} y2={H - P.b} className="wg-cursor" />}
        {pts.map(([px, py], i) => (
          <g key={i}>
            <circle className="wg-point" cx={px} cy={py} r={active === i ? 6 : 4} />
            <circle
              cx={px}
              cy={py}
              r="22"
              fill="transparent"
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${labels[i]}: Rs. ${values[i].toLocaleString()}`}
              style={{ cursor: 'pointer', outline: 'none' }}
            />
          </g>
        ))}
      </svg>
      {active !== null && (
        <div className="wg-tip" style={{ left: `${(pts[active][0] / W) * 100}%`, top: `${(pts[active][1] / H) * 100}%` }}>
          <span>{labels[active]}</span>
          <strong>Rs. {values[active].toLocaleString()}</strong>
        </div>
      )}
    </div>
  );
};

const niceMax = (v) => {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * pow;
};

/* ---------------------------------------------------- BookedVsCollected (bars) */

export const BookedVsCollected = ({ labels, booked, collected }) => {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);
  const W = 560;
  const H = 240;
  const P = { l: 46, r: 12, t: 16, b: 30 };
  const max = niceMax(Math.max(...booked, ...collected, 1));
  const slot = (W - P.l - P.r) / labels.length;
  const bw = Math.min(18, slot * 0.3);
  const ch = H - P.t - P.b;
  const y = (v) => H - P.b - (v / max) * ch;
  const base = H - P.b;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => max * r);

  return (
    <div ref={ref} className={`wg-chart ${seen ? 'in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Booked versus collected per month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wg-grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="wg-axis">{t === 0 ? '0' : formatMoney(t)}</text>
          </g>
        ))}
        {labels.map((m, i) => {
          const cx = P.l + slot * i + slot / 2;
          const bh = (booked[i] / max) * ch;
          const gh = (collected[i] / max) * ch;
          return (
            <g key={m + i}>
              <rect className="wg-bar" style={{ '--i': i }} x={cx - bw - 1.5} y={base - bh} width={bw} height={bh} rx="3" fill="var(--chart-2)" />
              <rect className="wg-bar" style={{ '--i': i + 0.5 }} x={cx + 1.5} y={base - gh} width={bw} height={gh} rx="3" fill="var(--chart-1)" />
              <text x={cx} y={H - 8} textAnchor="middle" className="wg-axis">{m}</text>
              <rect
                x={P.l + slot * i}
                y={P.t}
                width={slot}
                height={ch}
                fill="transparent"
                tabIndex={0}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${m}: booked Rs. ${booked[i].toLocaleString()}, collected Rs. ${collected[i].toLocaleString()}`}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div className="wg-tip top" style={{ left: `${((P.l + slot * active + slot / 2) / W) * 100}%` }}>
          <span>{labels[active]}</span>
          <strong><i style={{ background: 'var(--chart-2)' }} />Booked {formatMoney(booked[active])}</strong>
          <strong><i style={{ background: 'var(--chart-1)' }} />Collected {formatMoney(collected[active])}</strong>
        </div>
      )}
    </div>
  );
};

/* --------------------------------------------------------------- StatusDonut */

export const StatusDonut = ({ segments, centerLabel }) => {
  const [ref, seen] = useInView();
  const R = 70;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((a, s) => a + s.count, 0);
  let offset = 0;
  return (
    <div ref={ref} className={`wg-donut ${seen ? 'in' : ''}`}>
      <svg viewBox="0 0 200 200" role="img" aria-label={segments.map((s) => `${s.count} ${s.label}`).join(', ')}>
        <circle cx="100" cy="100" r={R} className="wg-donut-track" />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.count / total) * C;
            const dash = Math.max(len - 3, 0);
            const el = (
              <circle
                key={s.label}
                className="wg-donut-seg"
                style={{ '--i': i }}
                cx="100"
                cy="100"
                r={R}
                stroke={s.color}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="wg-donut-center">
        <strong><CountUp value={total} /></strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- PlotMap */

const PLOT_LABEL = { available: 'Available', booked: 'Booked', sold: 'Sold' };

export const PlotMap = ({ plots, limit = 60 }) => {
  const [filter, setFilter] = useState(null);
  const [ref, seen] = useInView();
  const counts = useMemo(() => {
    const c = { available: 0, booked: 0, sold: 0 };
    plots.forEach((p) => {
      c[p.status] += 1;
    });
    return c;
  }, [plots]);
  const shown = plots.slice(0, limit);

  if (!plots.length) return <p className="wg-empty">No plots yet. Add inventory to see the plot map.</p>;

  return (
    <div ref={ref} className={`wg-plotmap ${seen ? 'in' : ''}`}>
      <div className="wg-plot-filters" role="group" aria-label="Filter plots by status">
        {Object.keys(PLOT_LABEL).map((k) => (
          <button
            key={k}
            type="button"
            className={`wg-chip ${filter === k ? 'active' : ''}`}
            onClick={() => setFilter(filter === k ? null : k)}
            aria-pressed={filter === k}
          >
            <span className={`wg-swatch plot-${k}`} />
            {PLOT_LABEL[k]} <strong>{counts[k]}</strong>
          </button>
        ))}
      </div>
      <div className="wg-plot-grid">
        {shown.map((p, i) => (
          <div
            key={p.key}
            className={`wg-plot plot-${p.status} ${filter && filter !== p.status ? 'dim' : ''}`}
            style={{ '--i': i }}
            title={`Plot ${p.number} · ${PLOT_LABEL[p.status]}${p.project ? ` · ${p.project}` : ''}`}
          >
            {p.number}
          </div>
        ))}
      </div>
      {plots.length > limit && <p className="wg-more">Showing {limit} of {plots.length} plots</p>}
    </div>
  );
};

/* -------------------------------------------------------------- DealProgress */

export const DealProgress = ({ deals, onOpen }) => {
  if (!deals.length) return <p className="wg-empty">No deals yet. Create a deal to track its payments here.</p>;
  return (
    <div className="wg-table-wrap">
      <table className="wg-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Plot</th>
            <th>Progress</th>
            <th className="num">Received</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} onClick={() => onOpen && onOpen(d.id)} className={onOpen ? 'clickable' : ''}>
              <td data-label="Customer"><strong>{d.customer}</strong></td>
              <td data-label="Plot">{d.plot || '—'}</td>
              <td data-label="Progress">
                <div className="wg-progress-cell">
                  <FillBar pct={d.pct} color={d.status === 'cancelled' ? 'var(--overdue)' : d.pct >= 100 ? 'var(--paid)' : 'var(--chart-2)'} />
                  <span>{Math.round(d.pct)}%</span>
                </div>
              </td>
              <td data-label="Received" className="num">Rs. {d.paid.toLocaleString()}</td>
              <td data-label="Status"><StatusBadge status={d.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------ RecentPayments */

export const RecentPayments = ({ payments }) => {
  if (!payments.length) return <p className="wg-empty">No payments recorded yet.</p>;
  return (
    <ul className="wg-timeline">
      {payments.map((p, i) => (
        <li key={p.id} style={{ '--i': i }}>
          <span className="wg-timeline-dot" />
          <div className="wg-timeline-main">
            <strong>{p.customer}</strong>
            <span>{p.type} · {p.date}</span>
          </div>
          <div className="wg-timeline-amount">Rs. {p.amount.toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
};
