import React from 'react';
import { FillBar } from '../dashboard/widgets';
import '../dashboard/widgets.css';
import './pageCharts.css';

// Ranked list with a fill bar per row. rows: [{ key, label, pct, value, note, color }]
const RankedBars = ({ rows, empty = 'Nothing to show yet.' }) => {
  if (!rows.length) return <p className="wg-empty">{empty}</p>;
  return (
    <ul className="pc-ranked">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="pc-ranked-top">
            <strong title={r.label}>{r.label}</strong>
            <span>{r.value}</span>
          </div>
          <FillBar pct={r.pct} color={r.color} />
          {r.note && <small>{r.note}</small>}
        </li>
      ))}
    </ul>
  );
};

export default RankedBars;
