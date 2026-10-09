import React, { useMemo } from 'react';
import { ChartFrame, CollectionsTrend, StatusDonut, FillBar, formatMoney } from '../dashboard/widgets';
import { buildMonthWindow, sumByMonth, groupByType, num } from './insightsData';
import './charts.css';

// Charts above the Payments table, driven by the filtered rows so they follow search and filters.
const PaymentsInsights = ({ payments }) => {
  const data = useMemo(() => {
    const win = buildMonthWindow(payments.map((p) => p.payment_date));
    const types = groupByType(payments);
    const payers = {};
    payments.forEach((p) => {
      const name = p.customer_name || `Deal #${p.deal_id}`;
      if (!payers[name]) payers[name] = { name, amount: 0, count: 0 };
      payers[name].amount += num(p.amount);
      payers[name].count += 1;
    });
    const top = Object.values(payers).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return {
      labels: win.labels,
      values: sumByMonth(payments, 'payment_date', (p) => num(p.amount), win),
      types,
      top,
      topMax: top.length ? top[0].amount : 0,
    };
  }, [payments]);

  const empty = payments.length === 0;
  const none = <p className="wg-empty">No payments match the current filters.</p>;

  return (
    <div className="pl-insights">
      <div className="wg-grid-2">
        <ChartFrame title="Collections trend" subtitle="Money received per month">
          {empty ? none : <CollectionsTrend labels={data.labels} values={data.values} />}
        </ChartFrame>
        <ChartFrame
          title="Payments by type"
          subtitle="Share of entries, with the amount received"
          legend={data.types.map((t) => ({ label: t.label, color: t.color, value: formatMoney(t.amount) }))}
        >
          {empty ? (
            none
          ) : (
            <StatusDonut segments={data.types.map((t) => ({ label: t.label, color: t.color, count: t.count }))} centerLabel="payments" />
          )}
        </ChartFrame>
      </div>
      <ChartFrame title="Top payers" subtitle="Largest totals received by associate">
        {empty ? (
          none
        ) : (
          <ul className="pl-rank">
            {data.top.map((t) => (
              <li key={t.name}>
                <div className="pl-rank-head">
                  <strong>{t.name}</strong>
                  <span>Rs. {t.amount.toLocaleString()} · {t.count} {t.count === 1 ? 'entry' : 'entries'}</span>
                </div>
                <FillBar pct={data.topMax > 0 ? (t.amount / data.topMax) * 100 : 0} />
              </li>
            ))}
          </ul>
        )}
      </ChartFrame>
    </div>
  );
};

export default PaymentsInsights;
