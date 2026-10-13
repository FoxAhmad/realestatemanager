import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { ChartFrame, formatMoney } from '../dashboard/widgets';
import { num, monthBuckets, GroupedBars, BarList, ChartEmpty } from './ledgerCharts';

const count = (v) => num(v).toLocaleString();

/**
 * Forms held per dealer (from the page's summary) and forms issued vs used per month
 * (from GET /balance-transactions/8, the Advance for Certificate ledger the summary is built on).
 */
const FormsLedgerCharts = ({ summary, valuePerForm }) => {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/balance-transactions/8')
      .then((res) => {
        if (!cancelled) setLines(Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => console.error('Error fetching forms movements:', err));
    return () => {
      cancelled = true;
    };
  }, [summary]);

  const holders = useMemo(
    () =>
      [...summary]
        .map((d) => ({ ...d, held: num(d.forms_held) }))
        .sort((a, b) => Math.abs(b.held) - Math.abs(a.held))
        .slice(0, 10)
        .map((d) => ({
          key: d.dealer_id,
          label: d.dealer_name,
          text: `${count(d.held)} forms · Rs. ${formatMoney(d.held * valuePerForm)}`,
          bars: [{ value: d.held, color: d.held < 0 ? 'var(--overdue)' : 'var(--chart-1)', title: `${count(d.held)} forms` }],
        })),
    [summary, valuePerForm]
  );

  const monthly = useMemo(() => {
    const seen = new Set();
    const unique = lines.filter((l) => {
      if (l.line_id === undefined || l.line_id === null) return true;
      if (seen.has(l.line_id)) return false;
      seen.add(l.line_id);
      return true;
    });
    return monthBuckets(
      unique,
      (l) => l.transaction_date,
      (l) => {
        const q = parseInt(l.quantity, 10) || 0;
        return num(l.credit) > 0 ? [q, 0] : [0, q];
      },
      2
    );
  }, [lines]);

  const totalHeld = summary.reduce((s, d) => s + num(d.forms_held), 0);

  return (
    <div className="lc-wrap">
      <div className="wg-grid-2">
        <ChartFrame
          title="Forms held by dealer"
          subtitle={`${count(totalHeld)} forms outstanding in total`}
        >
          {holders.length ? <BarList rows={holders} ariaLabel="Forms held per dealer" /> : <ChartEmpty>No dealer holds any forms yet.</ChartEmpty>}
        </ChartFrame>
        <ChartFrame
          title="Forms issued vs used"
          subtitle="Quantity per month"
          legend={[{ label: 'Issued', color: 'var(--chart-1)' }, { label: 'Used / returned', color: 'var(--chart-2)' }]}
        >
          {monthly ? (
            <GroupedBars
              labels={monthly.labels}
              ariaLabel="Forms issued versus used per month"
              format={count}
              series={[
                { label: 'Issued', color: 'var(--chart-1)', values: monthly.series[0] },
                { label: 'Used', color: 'var(--chart-2)', values: monthly.series[1] },
              ]}
            />
          ) : (
            <ChartEmpty>No form movements recorded yet.</ChartEmpty>
          )}
        </ChartFrame>
      </div>
    </div>
  );
};

export default FormsLedgerCharts;
