import React, { useMemo } from 'react';
import { ChartFrame } from '../dashboard/widgets';
import { num, money, moneyFull, monthBuckets, GroupedBars, BarList, ChartEmpty } from './ledgerCharts';

// Same owe / owed split as MutualNetReport: positive = owed to us, negative = we owe.
const signedPeers = (balances, isManagement) => {
  const out = [];
  if (isManagement) {
    balances.forEach((b) => {
      const p1Mgmt = b.party1_role === 'admin' || b.party1_role === 'accountant';
      const p2Mgmt = b.party2_role === 'admin' || b.party2_role === 'accountant';
      const net = num(b.net_balance);
      if (p1Mgmt && !p2Mgmt) out.push({ key: b.party2_id, name: b.party2_name, value: net });
      else if (!p1Mgmt && p2Mgmt) out.push({ key: b.party1_id, name: b.party1_name, value: -net });
    });
  } else {
    balances.forEach((b) => out.push({ key: b.peer_id, name: b.peer_name, value: num(b.net_balance) }));
  }
  return out.filter((p) => p.value !== 0);
};

/** balances = GET /dealer-exchanges/balances peerBalances; exchanges = the exchange rows currently shown. */
const ExchangeCharts = ({ balances, exchanges, isManagement }) => {
  const owedLabel = isManagement ? 'Owed to us' : 'Owed to me';
  const oweLabel = isManagement ? 'We owe' : 'I owe';

  const rows = useMemo(
    () =>
      signedPeers(balances, isManagement)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 10)
        .map((p) => ({
          key: p.key,
          label: p.name,
          text: `${p.value > 0 ? owedLabel : oweLabel} ${money(Math.abs(p.value))}`,
          bars: [{ value: p.value, color: p.value > 0 ? 'var(--chart-1)' : 'var(--overdue)', title: moneyFull(p.value) }],
        })),
    [balances, isManagement, owedLabel, oweLabel]
  );

  const monthly = useMemo(
    () => monthBuckets(exchanges, (e) => e.exchange_date, (e) => [num(e.amount)], 1),
    [exchanges]
  );

  return (
    <div className="lc-wrap">
      <div className="wg-grid-2">
        <ChartFrame
          title="Net balance by dealer"
          subtitle="Who owes whom, largest first"
          legend={[
            { label: owedLabel, color: 'var(--chart-1)' },
            { label: oweLabel, color: 'var(--overdue)' },
          ]}
        >
          {rows.length ? <BarList rows={rows} ariaLabel="Net mutual balance per dealer" /> : <ChartEmpty>All mutual balances are settled.</ChartEmpty>}
        </ChartFrame>
        <ChartFrame title="Exchange volume" subtitle="Total amount exchanged per month">
          {monthly ? (
            <GroupedBars
              labels={monthly.labels}
              ariaLabel="Exchange volume per month"
              series={[{ label: 'Exchanged', color: 'var(--chart-1)', values: monthly.series[0] }]}
            />
          ) : (
            <ChartEmpty>No exchanges recorded yet.</ChartEmpty>
          )}
        </ChartFrame>
      </div>
    </div>
  );
};

export default ExchangeCharts;
