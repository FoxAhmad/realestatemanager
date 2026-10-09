import React, { useMemo } from 'react';
import { KpiCard, ChartFrame, StatusDonut, PlotMap } from '../dashboard/widgets';
import RankedBars from './RankedBars';
import { pctOf } from './chartData';
import '../dashboard/widgets.css';
import './pageCharts.css';

// Same mapping the dashboard uses: assigned and paid plots both count as booked.
const PLOT_STATUS = { available: 'available', assigned: 'booked', paid: 'booked', sold: 'sold' };

const EMPTY = { available: 0, booked: 0, sold: 0 };

// Plot status charts for the Inventory page. `items` are inventory rows (with plots / assigned_plots).
// byProject: show a per-project sold-share list (projects view) instead of the plot map (plots view).
const InventoryCharts = ({ items, byProject = false, scope }) => {
  const { plots, counts, projects } = useMemo(() => {
    const list = [];
    const perProject = {};
    (items || []).forEach((item) => {
      const name = item.project_name || 'No Project';
      [...(item.plots || []), ...(item.assigned_plots || [])].forEach((p) => {
        const status = PLOT_STATUS[p.plot_status || p.status] || 'available';
        list.push({ key: `${item.id}-${p.plot_id || p.id}`, number: p.plot_number, status, project: item.project_name || '' });
        if (!perProject[name]) perProject[name] = { name, ...EMPTY };
        perProject[name][status] += 1;
      });
    });
    const totals = list.reduce((c, p) => ({ ...c, [p.status]: c[p.status] + 1 }), { ...EMPTY });
    return { plots: list, counts: totals, projects: Object.values(perProject) };
  }, [items]);

  const total = plots.length;
  if (!total) return null;

  const segments = [
    { label: 'Available', color: 'var(--paid)', count: counts.available },
    { label: 'Booked', color: 'var(--pending)', count: counts.booked },
    { label: 'Sold', color: 'var(--primary)', count: counts.sold },
  ];

  const rows = projects
    .map((p) => ({ ...p, total: p.available + p.booked + p.sold }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((p) => ({
      key: p.name,
      label: p.name,
      pct: pctOf(p.sold, p.total),
      value: `${p.sold} / ${p.total} sold`,
      note: `${p.available} available · ${p.booked} booked`,
      color: 'var(--primary)',
    }));

  return (
    <div className="pc-row">
      <div className="wg-grid-kpi">
        <KpiCard label="Total plots" value={total} note={scope || 'Across your inventory'} />
        <KpiCard label="Available" value={counts.available} note={`${pctOf(counts.available, total).toFixed(0)}% of plots`} />
        <KpiCard label="Booked" value={counts.booked} note="Assigned or paid, not yet sold" />
        <KpiCard label="Sold" value={counts.sold} note={`${pctOf(counts.sold, total).toFixed(0)}% sell-through`} />
      </div>
      <div className="wg-grid-donut">
        <ChartFrame
          title="Plot status"
          subtitle={scope || 'All plots'}
          legend={segments.map((s) => ({ label: s.label, color: s.color, value: s.count }))}
        >
          <StatusDonut segments={segments} centerLabel="plots" />
        </ChartFrame>
        {byProject ? (
          <ChartFrame title="Sold by project" subtitle="Share of each project's plots that are sold">
            <RankedBars rows={rows} empty="No project plots yet." />
          </ChartFrame>
        ) : (
          <ChartFrame title="Plot map" subtitle="Each tile is a plot, coloured by status">
            <PlotMap plots={plots} />
          </ChartFrame>
        )}
      </div>
    </div>
  );
};

export default InventoryCharts;
