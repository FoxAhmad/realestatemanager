import React, { useMemo } from 'react';
import { LuHeartHandshake, LuHourglass, LuCheckCircle2, LuCoins } from 'react-icons/lu';
import { KpiCard, ChartFrame, StatusDonut, BookedVsCollected } from '../dashboard/widgets';
import { buildMonthWindow, sumByMonth, num } from './insightsData';
import './charts.css';

// Charts above the Deals table. `deals` is the filtered list the table shows, `payments` the
// receipts for the same user scope (used only for the collected side of the monthly chart).
const DealsInsights = ({ deals, payments }) => {
  const data = useMemo(() => {
    const ids = new Set(deals.map((d) => d.id));
    const dealPayments = payments.filter((p) => ids.has(p.deal_id));
    const active = deals.filter((d) => d.status !== 'deal_not_done');
    const win = buildMonthWindow([...deals.map((d) => d.created_at), ...dealPayments.map((p) => p.payment_date)]);
    const count = (s) => deals.filter((d) => d.status === s).length;
    return {
      total: deals.length,
      inProgress: count('in_progress'),
      completed: count('deal_done'),
      bookedValue: active.reduce((s, d) => s + num(d.sale_price), 0),
      collected: dealPayments.reduce((s, p) => s + num(p.amount), 0),
      labels: win.labels,
      booked: sumByMonth(active, 'created_at', (d) => num(d.sale_price), win),
      received: sumByMonth(dealPayments, 'payment_date', (p) => num(p.amount), win),
      createdPerMonth: sumByMonth(deals, 'created_at', () => 1, win),
      segments: [
        { label: 'In progress', color: 'var(--pending)', count: count('in_progress') },
        { label: 'Completed', color: 'var(--paid)', count: count('deal_done') },
        { label: 'Cancelled', color: 'var(--overdue)', count: count('deal_not_done') },
      ],
    };
  }, [deals, payments]);

  const empty = data.total === 0;
  const none = <p className="wg-empty">No deals match the current filters.</p>;

  return (
    <div className="pl-insights">
      <div className="wg-grid-kpi">
        <KpiCard label="Total deals" value={data.total} icon={<LuHeartHandshake />} spark={data.createdPerMonth} note="Created per month, last 7 months" />
        <KpiCard label="In progress" value={data.inProgress} icon={<LuHourglass />} note="Still collecting payments" />
        <KpiCard label="Completed" value={data.completed} icon={<LuCheckCircle2 />} note="Closed deals" />
        <KpiCard
          label="Booked value"
          value={data.bookedValue}
          prefix="Rs. "
          icon={<LuCoins />}
          note={`Rs. ${data.collected.toLocaleString()} received so far`}
        />
      </div>
      <div className="wg-grid-donut">
        <ChartFrame
          title="Deal status"
          subtitle="Deals matching the current filters"
          legend={data.segments.map((s) => ({ label: s.label, color: s.color, value: s.count }))}
        >
          {empty ? none : <StatusDonut segments={data.segments} centerLabel="deals" />}
        </ChartFrame>
        <ChartFrame
          title="Booked vs collected"
          subtitle="Deal value booked against money received, by month"
          legend={[
            { label: 'Booked', color: 'var(--chart-2)' },
            { label: 'Collected', color: 'var(--chart-1)' },
          ]}
        >
          {empty ? none : <BookedVsCollected labels={data.labels} booked={data.booked} collected={data.received} />}
        </ChartFrame>
      </div>
    </div>
  );
};

export default DealsInsights;
