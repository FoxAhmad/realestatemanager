import React, { useMemo } from 'react';
import { ChartFrame, formatMoney } from '../dashboard/widgets';
import {
  num, money, moneyFull, monthBuckets, GroupedBars, BarList, ShareDonut, ChartEmpty,
} from './ledgerCharts';

/** Projects view: per-project Dealer Advances vs Advance for Certificate balances (from GET /balance-projects). */
export const BalanceProjectCharts = ({ projects }) => {
  const rows = useMemo(
    () =>
      projects
        .map((p) => ({ name: p.name, adv: num(p.advances_balance), cert: num(p.certificate_balance), id: p.id }))
        .filter((p) => p.adv !== 0 || p.cert !== 0)
        .sort((a, b) => Math.abs(b.adv) + Math.abs(b.cert) - (Math.abs(a.adv) + Math.abs(a.cert)))
        .slice(0, 8),
    [projects]
  );

  const totals = useMemo(
    () => ({
      adv: projects.reduce((s, p) => s + num(p.advances_balance), 0),
      cert: projects.reduce((s, p) => s + num(p.certificate_balance), 0),
    }),
    [projects]
  );

  const barRows = rows.map((p) => ({
    key: p.id,
    label: p.name,
    text: `${money(p.adv)} / ${money(p.cert)}`,
    bars: [
      { value: p.adv, color: 'var(--chart-1)', title: `Advances ${moneyFull(p.adv)}` },
      { value: p.cert, color: 'var(--chart-2)', title: `Certificates ${moneyFull(p.cert)}` },
    ],
  }));

  const segments = [
    { label: 'Dealer Advances', value: Math.max(totals.adv, 0), color: 'var(--chart-1)', text: money(totals.adv) },
    { label: 'Advance for Certificate', value: Math.max(totals.cert, 0), color: 'var(--chart-2)', text: money(totals.cert) },
  ];
  const share = segments.reduce((s, x) => s + x.value, 0);

  return (
    <div className="lc-wrap">
      <div className="wg-grid-donut">
        <ChartFrame
          title="Advances vs certificates"
          subtitle="All projects combined"
          legend={segments.map((s) => ({ label: s.label, color: s.color, value: s.text }))}
        >
          {share > 0 ? (
            <ShareDonut segments={segments} centerValue={formatMoney(share)} centerLabel="combined" />
          ) : (
            <ChartEmpty>No balances recorded yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame
          title="Balance by project"
          subtitle="Largest projects first; amounts are advances / certificates"
          legend={[{ label: 'Dealer Advances', color: 'var(--chart-1)' }, { label: 'Advance for Certificate', color: 'var(--chart-2)' }]}
        >
          {barRows.length ? <BarList rows={barRows} ariaLabel="Balance per project" /> : <ChartEmpty>No project has a balance yet.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};

/** Entries view: credit vs debit per month for the loaded entries, plus each party's balance share. */
export const BalanceEntryCharts = ({ transactions, dealerBalances }) => {
  const monthly = useMemo(
    () => monthBuckets(transactions, (t) => t.transaction_date, (t) => [num(t.credit), num(t.debit)], 2),
    [transactions]
  );

  const parties = useMemo(
    () =>
      [...dealerBalances]
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
        .slice(0, 8)
        .map((d) => ({
          key: d.id,
          label: d.name,
          text: money(d.balance),
          bars: [{ value: d.balance, color: d.balance < 0 ? 'var(--overdue)' : 'var(--chart-1)', title: moneyFull(d.balance) }],
        })),
    [dealerBalances]
  );

  return (
    <div className="lc-wrap">
      <div className="wg-grid-2">
        <ChartFrame
          title="Credit vs debit"
          subtitle="Entries per month"
          legend={[{ label: 'Credit', color: 'var(--chart-1)' }, { label: 'Debit', color: 'var(--overdue)' }]}
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
            <ChartEmpty>No entries to chart yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame title="Balance by party" subtitle="Net balance per dealer or customer, largest first">
          {parties.length ? <BarList rows={parties} ariaLabel="Balance per party" /> : <ChartEmpty>No party balances yet.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};
