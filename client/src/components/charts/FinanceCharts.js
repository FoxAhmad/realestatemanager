import React, { useMemo } from 'react';
import { ChartFrame, formatMoney } from '../dashboard/widgets';
import {
  num, money, moneyFull, PALETTE, monthBuckets, monthIdx, monthLabel,
  GroupedBars, TrendLine, BarList, ShareDonut, ChartEmpty,
} from './ledgerCharts';

// Month-end running balance. `rows` come newest-first with runningBal already computed over the full ledger.
const monthEndBalance = (rows, maxMonths = 12) => {
  const byMonth = new Map();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const d = new Date(rows[i].transaction_date);
    if (!Number.isNaN(d.getTime())) byMonth.set(monthIdx(d), num(rows[i].runningBal));
  }
  if (!byMonth.size) return null;
  const keys = Array.from(byMonth.keys());
  const min = Math.min(...keys);
  const max = Math.max(...keys);
  const labels = [];
  const values = [];
  let carry = 0;
  for (let m = min; m <= max; m += 1) {
    if (byMonth.has(m)) carry = byMonth.get(m);
    labels.push(monthLabel(m));
    values.push(carry);
  }
  return { labels: labels.slice(-maxMonths), values: values.slice(-maxMonths) };
};

const methodOf = (row) => {
  const first = Array.from(row.instruments || [])[0] || '';
  const word = first.split(' ')[0];
  return word || 'Other';
};

/** Charts for the Finance ledger tab. rows = the ledger rows currently shown (merged + filtered). */
export const FinanceLedgerCharts = ({ rows, isAccountant }) => {
  const monthly = useMemo(() => monthBuckets(rows, (r) => r.transaction_date, (r) => [num(r.credit), num(r.debit)], 2), [rows]);
  const balance = useMemo(() => monthEndBalance(rows), [rows]);

  const methods = useMemo(() => {
    const totals = {};
    rows.forEach((r) => {
      if (num(r.credit) > 0) totals[methodOf(r)] = (totals[methodOf(r)] || 0) + num(r.credit);
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, PALETTE.length)
      .map(([label, value], i) => ({ label, value, color: PALETTE[i], text: moneyFull(value) }));
  }, [rows]);

  const dealers = useMemo(() => {
    if (!isAccountant) return [];
    const totals = {};
    rows.forEach((r) => {
      const k = r.user_name || 'System';
      totals[k] = (totals[k] || 0) + num(r.credit) - num(r.debit);
    });
    return Object.entries(totals)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 8)
      .map(([label, value]) => ({
        key: label,
        label,
        text: money(value),
        bars: [{ value, color: value < 0 ? 'var(--overdue)' : 'var(--chart-1)', title: moneyFull(value) }],
      }));
  }, [rows, isAccountant]);

  const methodTotal = methods.reduce((s, m) => s + m.value, 0);

  return (
    <div className="lc-wrap">
      <div className="wg-grid-2">
        <ChartFrame
          title="Money in vs money out"
          subtitle="Credit and debit per month, as listed in the ledger"
          legend={[{ label: 'Credit (in)', color: 'var(--chart-1)' }, { label: 'Debit (out)', color: 'var(--overdue)' }]}
        >
          {monthly ? (
            <GroupedBars
              labels={monthly.labels}
              ariaLabel="Credit versus debit per month"
              series={[
                { label: 'Credit', color: 'var(--chart-1)', values: monthly.series[0] },
                { label: 'Debit', color: 'var(--overdue)', values: monthly.series[1] },
              ]}
            />
          ) : (
            <ChartEmpty>No transactions to chart yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame title="Running balance" subtitle="Balance at the end of each month">
          {balance ? (
            <TrendLine labels={balance.labels} values={balance.values} ariaLabel="Month-end running balance" />
          ) : (
            <ChartEmpty>No transactions to chart yet.</ChartEmpty>
          )}
        </ChartFrame>
      </div>
      <div className="wg-grid-2">
        <ChartFrame
          title="Money in by method"
          subtitle="Total credit by payment instrument"
          legend={methods.map((m) => ({ label: m.label, color: m.color, value: `Rs. ${formatMoney(m.value)}` }))}
        >
          {methods.length ? (
            <ShareDonut segments={methods} centerValue={formatMoney(methodTotal)} centerLabel="total credit" />
          ) : (
            <ChartEmpty>No credits recorded yet.</ChartEmpty>
          )}
        </ChartFrame>
        {isAccountant && (
          <ChartFrame title="Net by dealer" subtitle="Credit minus debit per dealer, largest first">
            {dealers.length ? <BarList rows={dealers} ariaLabel="Net balance per dealer" /> : <ChartEmpty>No dealer movements yet.</ChartEmpty>}
          </ChartFrame>
        )}
      </div>
    </div>
  );
};

/** Charts for the Finance analytics tab. monthlyStats: [{month, revenue, profit}] newest first; dealerStats: [{dealer_name, total_revenue}]. */
export const FinanceAnalyticsCharts = ({ monthlyStats, dealerStats }) => {
  const months = useMemo(() => {
    const ordered = [...monthlyStats].reverse();
    return {
      labels: ordered.map((m) => new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
      revenue: ordered.map((m) => num(m.revenue)),
      profit: ordered.map((m) => num(m.profit)),
    };
  }, [monthlyStats]);

  const dealers = useMemo(
    () =>
      [...dealerStats]
        .filter((d) => num(d.total_revenue) > 0)
        .sort((a, b) => num(b.total_revenue) - num(a.total_revenue))
        .slice(0, 8)
        .map((d) => ({
          key: d.dealer_id || d.dealer_name,
          label: d.dealer_name,
          text: money(d.total_revenue),
          bars: [{ value: num(d.total_revenue), color: 'var(--chart-1)', title: moneyFull(d.total_revenue) }],
        })),
    [dealerStats]
  );

  return (
    <div className="lc-wrap">
      <div className="wg-grid-2">
        <ChartFrame
          title="Revenue vs profit"
          subtitle="Completed deals per month"
          legend={[{ label: 'Revenue', color: 'var(--chart-2)' }, { label: 'Net profit', color: 'var(--chart-1)' }]}
        >
          {months.labels.length ? (
            <GroupedBars
              labels={months.labels}
              ariaLabel="Revenue versus profit per month"
              series={[
                { label: 'Revenue', color: 'var(--chart-2)', values: months.revenue.map((v) => Math.max(v, 0)) },
                { label: 'Profit', color: 'var(--chart-1)', values: months.profit.map((v) => Math.max(v, 0)) },
              ]}
            />
          ) : (
            <ChartEmpty>No completed deals yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame title="Volume by salesperson" subtitle="Revenue from completed deals">
          {dealers.length ? <BarList rows={dealers} ariaLabel="Revenue per salesperson" /> : <ChartEmpty>No salesperson volume yet.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};
