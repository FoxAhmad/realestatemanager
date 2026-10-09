import React, { useMemo } from 'react';
import { ChartFrame, formatMoney } from '../dashboard/widgets';
import { num, money, moneyFull, PALETTE, BarList, ShareDonut, ChartEmpty } from './ledgerCharts';

/** Investor balances as listed in the registry (GET /investors): share of capital and balance per partner. */
const InvestorCharts = ({ investors }) => {
  const sorted = useMemo(
    () => [...investors].map((i) => ({ ...i, bal: num(i.balance) })).filter((i) => i.bal !== 0).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal)),
    [investors]
  );

  const segments = useMemo(() => {
    const positive = sorted.filter((i) => i.bal > 0);
    const top = positive.slice(0, PALETTE.length - 1);
    const rest = positive.slice(PALETTE.length - 1).reduce((s, i) => s + i.bal, 0);
    const out = top.map((i, k) => ({ label: i.name, value: i.bal, color: PALETTE[k], text: moneyFull(i.bal) }));
    if (rest > 0) out.push({ label: 'Others', value: rest, color: PALETTE[PALETTE.length - 1], text: moneyFull(rest) });
    return out;
  }, [sorted]);

  const total = segments.reduce((s, x) => s + x.value, 0);

  const rows = sorted.slice(0, 10).map((i) => ({
    key: i.id,
    label: i.name,
    text: money(i.bal),
    bars: [{ value: i.bal, color: i.bal < 0 ? 'var(--overdue)' : 'var(--chart-1)', title: moneyFull(i.bal) }],
  }));

  return (
    <div className="lc-wrap">
      <div className="wg-grid-donut">
        <ChartFrame
          title="Share of capital"
          subtitle="Investors with a positive balance"
          legend={segments.map((s) => ({ label: s.label, color: s.color, value: `${((s.value / total) * 100).toFixed(0)}%` }))}
        >
          {total > 0 ? (
            <ShareDonut segments={segments} centerValue={formatMoney(total)} centerLabel="total balance" />
          ) : (
            <ChartEmpty>No investor holds a positive balance yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame title="Balance by investor" subtitle="Largest balances first">
          {rows.length ? <BarList rows={rows} ariaLabel="Balance per investor" /> : <ChartEmpty>No investor balances to chart yet.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};

export default InvestorCharts;
