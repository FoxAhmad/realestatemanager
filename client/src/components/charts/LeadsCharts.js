import React, { useMemo } from 'react';
import { KpiCard, ChartFrame } from '../dashboard/widgets';
import CountBars from './CountBars';
import RankedBars from './RankedBars';
import { monthlyCounts, pctOf } from './chartData';
import '../dashboard/widgets.css';
import './pageCharts.css';

const STAGES = [
  { key: 'new', label: 'New', color: 'var(--chart-2)' },
  { key: 'contacted', label: 'Contacted', color: 'var(--chart-4)' },
  { key: 'on_hold', label: 'On hold', color: '#94a3b8' },
  { key: 'successful', label: 'Successful', color: 'var(--chart-1)' },
  { key: 'unsuccessful', label: 'Unsuccessful', color: 'var(--overdue)' },
];

// Lead pipeline by status, conversion rate and leads per month. `leads` follows the table's current filters.
const LeadsCharts = ({ leads }) => {
  const stats = useMemo(() => {
    const counts = {};
    leads.forEach((l) => {
      const k = l.status || 'new';
      counts[k] = (counts[k] || 0) + 1;
    });
    const open = (counts.new || 0) + (counts.contacted || 0) + (counts.on_hold || 0);
    const unassigned = leads.filter((l) => !l.assigned_to && !['successful', 'unsuccessful'].includes(l.status)).length;
    return { counts, open, unassigned, monthly: monthlyCounts(leads, 'created_at') };
  }, [leads]);

  if (!leads.length) {
    return (
      <div className="pc-row">
        <ChartFrame title="Lead pipeline" subtitle="Leads by status and per month">
          <p className="wg-empty">No leads to chart yet. Add or import leads to see the pipeline.</p>
        </ChartFrame>
      </div>
    );
  }

  const total = leads.length;
  const won = stats.counts.successful || 0;
  const closed = won + (stats.counts.unsuccessful || 0);
  const rows = STAGES.map((s) => {
    const n = stats.counts[s.key] || 0;
    return { key: s.key, label: s.label, pct: pctOf(n, total), value: `${n} (${pctOf(n, total).toFixed(0)}%)`, color: s.color };
  });

  return (
    <div className="pc-row">
      <div className="wg-grid-kpi">
        <KpiCard label="Total leads" value={total} note="Matching the current filters" />
        <KpiCard label="Open pipeline" value={stats.open} note="New, contacted or on hold" />
        <KpiCard
          label="Conversion rate"
          value={pctOf(won, total)}
          decimals={1}
          suffix="%"
          note={closed > 0 ? `${won} won of ${closed} closed leads` : 'No closed leads yet'}
        />
        <KpiCard label="Unassigned" value={stats.unassigned} note="Open leads without a salesperson" />
      </div>
      <div className="wg-grid-2">
        <ChartFrame title="Lead pipeline" subtitle="Where every lead currently stands">
          <RankedBars rows={rows} />
        </ChartFrame>
        <ChartFrame title="Leads per month" subtitle="New leads in the last 7 months">
          <CountBars labels={stats.monthly.labels} values={stats.monthly.values} noun="leads" />
        </ChartFrame>
      </div>
    </div>
  );
};

export default LeadsCharts;
