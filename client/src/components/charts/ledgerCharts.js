import React, { useMemo, useState } from 'react';
import { useInView, formatMoney } from '../dashboard/widgets';
import './ledgerCharts.css';

/* Shared building blocks for the ledger-style pages (Finance, Balances, Forms, Investors, Loans, Exchanges, Slips).
   Everything here draws whatever arrays it is given; no numbers are invented. */

export const num = (v) => parseFloat(v) || 0;

export const money = (v) => `${num(v) < 0 ? '-' : ''}Rs. ${formatMoney(v)}`;
export const moneyFull = (v) => `${num(v) < 0 ? '-' : ''}Rs. ${Math.abs(num(v)).toLocaleString()}`;

export const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', '#94a3b8'];

const niceMax = (v) => {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return step * pow;
};

export const monthLabel = (monthIndex) =>
  new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export const monthIdx = (d) => d.getFullYear() * 12 + d.getMonth();

/**
 * Sums values into calendar months. `valuesOf(row)` returns one number per series.
 * Covers the latest `maxMonths` months that contain data (gaps are zero). Returns null when no row has a usable date.
 */
export const monthBuckets = (rows, dateOf, valuesOf, seriesCount, maxMonths = 12) => {
  const pts = [];
  rows.forEach((r) => {
    const d = new Date(dateOf(r));
    if (!Number.isNaN(d.getTime())) pts.push([monthIdx(d), valuesOf(r)]);
  });
  if (!pts.length) return null;
  let max = pts[0][0];
  let min = pts[0][0];
  pts.forEach(([i]) => {
    if (i > max) max = i;
    if (i < min) min = i;
  });
  min = Math.max(min, max - maxMonths + 1);
  const n = max - min + 1;
  const series = Array.from({ length: seriesCount }, () => Array(n).fill(0));
  pts.forEach(([i, vals]) => {
    if (i < min) return;
    vals.forEach((v, k) => {
      series[k][i - min] += v;
    });
  });
  return { labels: Array.from({ length: n }, (_, i) => monthLabel(min + i)), series };
};

export const ChartEmpty = ({ children }) => <p className="wg-empty">{children}</p>;

/* ------------------------------------------------------------ GroupedBars */

export const GroupedBars = ({ labels, series, ariaLabel, format = money }) => {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);
  const W = 560;
  const H = 240;
  const P = { l: 46, r: 12, t: 16, b: 30 };
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
  const slot = (W - P.l - P.r) / labels.length;
  const bw = Math.min(18, (slot * 0.7) / series.length);
  const ch = H - P.t - P.b;
  const base = H - P.b;
  const y = (v) => base - (v / max) * ch;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => max * r);
  const step = labels.length > 6 ? Math.ceil(labels.length / 6) : 1;

  return (
    <div ref={ref} className={`wg-chart ${seen ? 'in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wg-grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="wg-axis">{t === 0 ? '0' : formatMoney(t)}</text>
          </g>
        ))}
        {labels.map((m, i) => {
          const cx = P.l + slot * i + slot / 2;
          const total = bw * series.length + 3 * (series.length - 1);
          return (
            <g key={m + i}>
              {series.map((s, k) => {
                const h = (s.values[i] / max) * ch;
                return (
                  <rect
                    key={s.label}
                    className="wg-bar"
                    style={{ '--i': i + k * 0.5 }}
                    x={cx - total / 2 + k * (bw + 3)}
                    y={base - h}
                    width={bw}
                    height={h}
                    rx="3"
                    fill={s.color}
                  />
                );
              })}
              {i % step === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="wg-axis">{m}</text>}
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
                aria-label={`${m}: ${series.map((s) => `${s.label} ${format(s.values[i])}`).join(', ')}`}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div className="wg-tip top" style={{ left: `${((P.l + slot * active + slot / 2) / W) * 100}%` }}>
          <span>{labels[active]}</span>
          {series.map((s) => (
            <strong key={s.label}><i style={{ background: s.color }} />{s.label} {format(s.values[active])}</strong>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------- TrendLine */

let lineSeq = 0;

export const TrendLine = ({ labels, values, ariaLabel, seriesLabel = 'Balance', format = money }) => {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);
  const gid = useMemo(() => `lc-${(lineSeq += 1)}`, []);
  const W = 560;
  const H = 240;
  const P = { l: 46, r: 16, t: 20, b: 30 };
  const hi = Math.max(...values, 0);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;
  const x = (i) => P.l + (i / Math.max(values.length - 1, 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - ((v - lo) / span) * (H - P.t - P.b);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = pts.length > 1 ? pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') : `M${P.l},${y(values[0])} L${W - P.r},${y(values[0])}`;
  const area = `${line} L${pts.length > 1 ? x(values.length - 1) : W - P.r},${y(0)} L${P.l},${y(0)} Z`;
  const ticks = [0, 0.5, 1].map((r) => lo + span * r);
  const step = labels.length > 6 ? Math.ceil(labels.length / 6) : 1;

  return (
    <div ref={ref} className={`wg-chart ${seen ? 'in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wg-grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="wg-axis">{`${t < 0 ? '-' : ''}${t === 0 ? '0' : formatMoney(t)}`}</text>
          </g>
        ))}
        {lo < 0 && <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="lc-zero" />}
        {labels.map((m, i) => (i % step === 0 ? <text key={m + i} x={x(i)} y={H - 8} textAnchor="middle" className="wg-axis">{m}</text> : null))}
        <path className="wg-area" d={area} fill={`url(#${gid})`} />
        <path className="wg-line" d={line} pathLength="1" />
        {active !== null && <line x1={pts[active][0]} x2={pts[active][0]} y1={P.t} y2={H - P.b} className="wg-cursor" />}
        {pts.map(([px, py], i) => (
          <g key={i}>
            <circle className="wg-point" cx={px} cy={py} r={active === i ? 6 : 4} />
            <circle
              cx={px}
              cy={py}
              r="18"
              fill="transparent"
              tabIndex={0}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${labels[i]}: ${format(values[i])}`}
              style={{ cursor: 'pointer', outline: 'none' }}
            />
          </g>
        ))}
      </svg>
      {active !== null && (
        <div className="wg-tip" style={{ left: `${(pts[active][0] / W) * 100}%`, top: `${(pts[active][1] / H) * 100}%` }}>
          <span>{labels[active]}</span>
          <strong>{seriesLabel} {format(values[active])}</strong>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- BarList */

/**
 * Ranked horizontal bars. rows: [{ key, label, text, bars: [{ value, color }] }].
 * Negative values draw to the left of a centre line, positive to the right (diverging) when any bar is negative.
 */
export const BarList = ({ rows, ariaLabel }) => {
  const [ref, seen] = useInView();
  const all = rows.flatMap((r) => r.bars.map((b) => b.value));
  const maxAbs = Math.max(...all.map((v) => Math.abs(v)), 1);
  const diverging = all.some((v) => v < 0);

  return (
    <ul ref={ref} className={`lc-list ${seen ? 'in' : ''} ${diverging ? 'diverging' : ''}`} aria-label={ariaLabel}>
      {rows.map((r, i) => (
        <li key={r.key} style={{ '--i': i }}>
          <div className="lc-row-top">
            <span className="lc-row-label" title={r.label}>{r.label}</span>
            <strong>{r.text}</strong>
          </div>
          {r.bars.map((b, k) => {
            const w = (Math.abs(b.value) / maxAbs) * (diverging ? 50 : 100);
            const neg = b.value < 0;
            return (
              <div key={k} className="lc-track" title={b.title}>
                {diverging && <span className="lc-center" />}
                <span
                  className={`lc-bar ${neg ? 'neg' : ''}`}
                  style={{
                    width: `${w}%`,
                    background: b.color,
                    [neg ? 'right' : 'left']: diverging ? '50%' : 0,
                  }}
                />
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------- ShareDonut */

export const ShareDonut = ({ segments, centerValue, centerLabel }) => {
  const [ref, seen] = useInView();
  const R = 70;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <div ref={ref} className={`wg-donut lc-donut ${seen ? 'in' : ''}`}>
      <svg viewBox="0 0 200 200" role="img" aria-label={segments.map((s) => `${s.label} ${s.text}`).join(', ')}>
        <circle cx="100" cy="100" r={R} className="wg-donut-track" />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * C;
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
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
};
