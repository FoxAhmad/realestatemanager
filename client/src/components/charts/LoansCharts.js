import React, { useMemo } from 'react';
import { ChartFrame, formatMoney } from '../dashboard/widgets';
import { num, money, moneyFull, BarList, ShareDonut, ChartEmpty } from './ledgerCharts';

const sum = (rows) => rows.reduce((s, r) => s + num(r.balance), 0);

const toRows = (rows, color, tag) =>
  rows
    .filter((r) => num(r.balance) > 0)
    .map((r) => ({
      key: `${tag}-${r.account_id}`,
      label: tag ? `${r.name} (${tag})` : r.name,
      value: num(r.balance),
      text: money(r.balance),
      bars: [{ value: num(r.balance), color, title: moneyFull(r.balance) }],
    }));

/**
 * Loans & investments: where the outstanding money sits (all rows, same totals as the summary cards),
 * and the largest outstanding balances for the active tab (respecting the table filters).
 */
const LoansCharts = ({ loans, investments, filteredReceivable, filteredPayable, filteredInvestments, activeTab }) => {
  const totals = useMemo(
    () => ({ receivable: sum(loans.receivable), payable: sum(loans.payable), invested: sum(investments) }),
    [loans, investments]
  );

  const segments = [
    { label: 'Owed to us', value: Math.max(totals.receivable, 0), color: 'var(--chart-1)', text: money(totals.receivable) },
    { label: 'We owe', value: Math.max(totals.payable, 0), color: 'var(--chart-2)', text: money(totals.payable) },
    { label: 'Invested', value: Math.max(totals.invested, 0), color: 'var(--chart-3)', text: money(totals.invested) },
  ];
  const total = segments.reduce((s, x) => s + x.value, 0);

  const rows = useMemo(() => {
    const list = activeTab === 'loans'
      ? [...toRows(filteredReceivable, 'var(--chart-1)', 'owed to us'), ...toRows(filteredPayable, 'var(--chart-2)', 'we owe')]
      : toRows(filteredInvestments, 'var(--chart-3)', '');
    return list.sort((a, b) => b.value - a.value).slice(0, 8);
  }, [activeTab, filteredReceivable, filteredPayable, filteredInvestments]);

  return (
    <div className="lc-wrap">
      <div className="wg-grid-donut">
        <ChartFrame
          title="Where the money sits"
          subtitle="Outstanding balances"
          legend={segments.map((s) => ({ label: s.label, color: s.color, value: s.text }))}
        >
          {total > 0 ? (
            <ShareDonut segments={segments} centerValue={formatMoney(total)} centerLabel="outstanding" />
          ) : (
            <ChartEmpty>Nothing is outstanding yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame
          title={activeTab === 'loans' ? 'Largest outstanding loans' : 'Largest outstanding investments'}
          subtitle="Balances still open, largest first"
          legend={activeTab === 'loans' ? [{ label: 'Owed to us', color: 'var(--chart-1)' }, { label: 'We owe', color: 'var(--chart-2)' }] : undefined}
        >
          {rows.length ? <BarList rows={rows} ariaLabel="Largest outstanding balances" /> : <ChartEmpty>No open balances to chart.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};

export default LoansCharts;
