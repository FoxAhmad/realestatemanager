import React, { useMemo } from 'react';
import { ChartFrame } from '../dashboard/widgets';
import { num, money, moneyFull, monthBuckets, GroupedBars, BarList, ShareDonut, ChartEmpty } from './ledgerCharts';

const STATUS = [
  { key: 'available', label: 'Available', color: 'var(--paid)' },
  { key: 'given_out', label: 'Given Out', color: 'var(--pending)' },
  { key: 'used', label: 'Used', color: 'var(--chart-3)' },
  { key: 'lost', label: 'Lost', color: 'var(--overdue)' },
];

const topBy = (slips, keyOf, limit = 8) => {
  const totals = {};
  slips.forEach((s) => {
    const k = (keyOf(s) || '').trim() || 'Unspecified';
    const t = totals[k] || (totals[k] = { count: 0, amount: 0 });
    t.count += 1;
    t.amount += num(s.installment_amount);
  });
  return Object.entries(totals)
    .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)
    .slice(0, limit)
    .map(([label, t]) => ({
      key: label,
      label,
      text: `${t.count} slip${t.count === 1 ? '' : 's'} · ${money(t.amount)}`,
      bars: [{ value: t.amount, color: 'var(--chart-1)', title: moneyFull(t.amount) }],
    }));
};

/** slips = the slip rows currently shown (after the table filters). */
const SlipCharts = ({ slips }) => {
  const statuses = useMemo(() => {
    const known = STATUS.map((s) => ({ ...s, value: slips.filter((x) => x.slip_status === s.key).length }));
    const other = slips.filter((x) => !STATUS.some((s) => s.key === x.slip_status)).length;
    return [...known, { key: 'other', label: 'Other', color: '#94a3b8', value: other }].filter((s) => s.value > 0).map((s) => ({ ...s, text: String(s.value) }));
  }, [slips]);

  const monthly = useMemo(
    () => monthBuckets(slips, (s) => s.slip_date, (s) => [num(s.installment_amount), num(s.investment_value)], 2),
    [slips]
  );

  const owners = useMemo(() => topBy(slips, (s) => s.slip_owner), [slips]);
  const offices = useMemo(() => topBy(slips, (s) => s.referred_by), [slips]);

  return (
    <div className="lc-wrap">
      <div className="wg-grid-donut">
        <ChartFrame
          title="Slips by status"
          subtitle="Slips in the current view"
          legend={statuses.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
        >
          {statuses.length ? (
            <ShareDonut segments={statuses} centerValue={slips.length} centerLabel="slips" />
          ) : (
            <ChartEmpty>No slips recorded yet.</ChartEmpty>
          )}
        </ChartFrame>
        <ChartFrame
          title="Installment vs investment value"
          subtitle="By slip date, per month"
          legend={[{ label: 'Installment', color: 'var(--chart-2)' }, { label: 'Investment value', color: 'var(--chart-1)' }]}
        >
          {monthly ? (
            <GroupedBars
              labels={monthly.labels}
              ariaLabel="Installment versus investment value per month"
              series={[
                { label: 'Installment', color: 'var(--chart-2)', values: monthly.series[0] },
                { label: 'Investment value', color: 'var(--chart-1)', values: monthly.series[1] },
              ]}
            />
          ) : (
            <ChartEmpty>No dated slips to chart yet.</ChartEmpty>
          )}
        </ChartFrame>
      </div>
      <div className="wg-grid-2">
        <ChartFrame title="By slip owner" subtitle="Installment amount per owner">
          {owners.length ? <BarList rows={owners} ariaLabel="Installment per slip owner" /> : <ChartEmpty>No slips recorded yet.</ChartEmpty>}
        </ChartFrame>
        <ChartFrame title="By estate / office" subtitle="Installment amount per referrer, largest first">
          {offices.length ? <BarList rows={offices} ariaLabel="Installment per estate or office" /> : <ChartEmpty>No slips recorded yet.</ChartEmpty>}
        </ChartFrame>
      </div>
    </div>
  );
};

export default SlipCharts;
