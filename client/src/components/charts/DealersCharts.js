import React, { useMemo } from 'react';
import { KpiCard, ChartFrame, StatusDonut, formatMoney } from '../dashboard/widgets';
import RankedBars from './RankedBars';
import '../dashboard/widgets.css';
import './pageCharts.css';

const num = (v) => parseFloat(v) || 0;

// Deals and booked value per salesperson, from the deals list (cancelled deals are not counted as booked).
const DealersCharts = ({ dealers, deals }) => {
  const stats = useMemo(() => {
    const live = deals.filter((d) => d.status !== 'deal_not_done');
    const perDealer = {};
    dealers.forEach((d) => {
      perDealer[d.id] = { id: d.id, name: d.name, deals: 0, value: 0 };
    });
    live.forEach((d) => {
      const row = perDealer[d.dealer_id];
      if (!row) return;
      row.deals += 1;
      row.value += num(d.sale_price);
    });
    const ranked = Object.values(perDealer).sort((a, b) => b.value - a.value || b.deals - a.deals);
    return {
      ranked,
      booked: live.reduce((s, d) => s + num(d.sale_price), 0),
      segments: [
        { label: 'In progress', color: 'var(--pending)', count: deals.filter((d) => d.status === 'in_progress').length },
        { label: 'Completed', color: 'var(--paid)', count: deals.filter((d) => d.status === 'deal_done').length },
        { label: 'Cancelled', color: 'var(--overdue)', count: deals.filter((d) => d.status === 'deal_not_done').length },
      ],
    };
  }, [dealers, deals]);

  if (!dealers.length) return null;

  if (!deals.length) {
    return (
      <div className="pc-row">
        <ChartFrame title="Sales performance" subtitle="Deals and booked value per salesperson">
          <p className="wg-empty">No deals yet. Performance charts appear once deals are created.</p>
        </ChartFrame>
      </div>
    );
  }

  const top = stats.ranked.slice(0, 8);
  const max = Math.max(...top.map((r) => r.value), 0);
  const rows = top.map((r) => ({
    key: r.id,
    label: r.name,
    pct: max > 0 ? (r.value / max) * 100 : 0,
    value: `Rs. ${formatMoney(r.value)}`,
    note: `${r.deals} ${r.deals === 1 ? 'deal' : 'deals'}`,
    color: 'var(--chart-1)',
  }));
  const active = stats.ranked.filter((r) => r.deals > 0).length;

  return (
    <div className="pc-row">
      <div className="wg-grid-kpi">
        <KpiCard label="Salespersons" value={dealers.length} note={`${active} with live deals`} />
        <KpiCard label="Total deals" value={deals.length} note="Across the whole team" />
        <KpiCard label="Booked value" value={stats.booked} prefix="Rs. " note="Excludes cancelled deals" />
        <KpiCard
          label="Top performer"
          value={top[0] ? top[0].deals : 0}
          suffix=" deals"
          note={top[0] && top[0].deals > 0 ? top[0].name : 'No live deals yet'}
        />
      </div>
      <div className="wg-grid-donut">
        <ChartFrame
          title="Deal status"
          subtitle="All deals"
          legend={stats.segments.map((s) => ({ label: s.label, color: s.color, value: s.count }))}
        >
          <StatusDonut segments={stats.segments} centerLabel="deals" />
        </ChartFrame>
        <ChartFrame title="Booked value by salesperson" subtitle="Ranked by the sale value of their live deals">
          <RankedBars rows={rows} />
        </ChartFrame>
      </div>
    </div>
  );
};

export default DealersCharts;
