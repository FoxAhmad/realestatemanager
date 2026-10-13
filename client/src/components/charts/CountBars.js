import React, { useState } from 'react';
import { useInView } from '../dashboard/widgets';
import '../dashboard/widgets.css';
import './pageCharts.css';

// Single-series bar chart of whole-number counts per month (reuses the .wg-* chart styling).
const CountBars = ({ labels, values, noun = 'items', color = 'var(--chart-1)' }) => {
  const [ref, seen] = useInView();
  const [active, setActive] = useState(null);
  const W = 560;
  const H = 220;
  const P = { l: 34, r: 12, t: 16, b: 30 };
  const peak = Math.max(...values, 0);
  const max = Math.max(4, Math.ceil(peak / 4) * 4);
  const slot = (W - P.l - P.r) / Math.max(labels.length, 1);
  const bw = Math.min(28, slot * 0.5);
  const ch = H - P.t - P.b;
  const base = H - P.b;
  const y = (v) => base - (v / max) * ch;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => max * r);

  return (
    <div ref={ref} className={`wg-chart ${seen ? 'in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${noun} per month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="wg-grid" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="wg-axis">{t}</text>
          </g>
        ))}
        {labels.map((m, i) => {
          const cx = P.l + slot * i + slot / 2;
          const h = (values[i] / max) * ch;
          return (
            <g key={m + i}>
              <rect className="wg-bar" style={{ '--i': i }} x={cx - bw / 2} y={base - h} width={bw} height={h} rx="4" fill={color} opacity={active === null || active === i ? 1 : 0.5} />
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
                aria-label={`${m}: ${values[i]} ${noun}`}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div className="wg-tip top" style={{ left: `${((P.l + slot * active + slot / 2) / W) * 100}%` }}>
          <span>{labels[active]}</span>
          <strong><i style={{ background: color }} />{values[active]} {noun}</strong>
        </div>
      )}
    </div>
  );
};

export default CountBars;
