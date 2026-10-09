import React, { useMemo } from 'react';
import { ChartFrame, FillBar, useInView } from '../dashboard/widgets';
import { groupByType, num, typeLabel } from './insightsData';
import './charts.css';

// Payment progress, payment timeline and per-type breakdown for one deal.
const DealDetailInsights = ({ deal, payments, adjustments }) => {
  const [stackRef, stackSeen] = useInView();

  const data = useMemo(() => {
    const price = num(deal.sale_price);
    const paid = payments.reduce((s, p) => s + num(p.amount), 0);
    const forms = adjustments.reduce((s, a) => s + num(a.customer_price), 0);
    const received = paid + forms;
    const pct = (v) => (price > 0 ? Math.min(100, (v / price) * 100) : 0);

    // Chronological flow with the running total against the sale price.
    let running = 0;
    const flow = [...payments]
      .sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date))
      .map((p) => {
        running += num(p.amount);
        const d = new Date(p.payment_date);
        return {
          id: p.id,
          label: p.payment_type === 'installment' && p.installment_no ? `${p.installment_no} installment` : typeLabel(p.payment_type),
          date: Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(),
          amount: num(p.amount),
          cumPct: pct(running),
        };
      });

    const types = groupByType(payments);
    if (forms > 0) types.push({ label: 'Adjustment forms', amount: forms, count: adjustments.length, color: '#ffc107' });
    types.sort((a, b) => b.amount - a.amount);

    return {
      price,
      paid,
      forms,
      received,
      remaining: price - received,
      receivedPct: price > 0 ? (received / price) * 100 : 0,
      paidPct: pct(paid),
      formsPct: Math.min(pct(forms), Math.max(0, 100 - pct(paid))),
      flow,
      types,
      typeMax: types.length ? Math.max(...types.map((t) => t.amount)) : 0,
    };
  }, [deal, payments, adjustments]);

  const noPayments = payments.length === 0 && adjustments.length === 0;

  return (
    <div className="pl-insights">
      <ChartFrame
        title="Payment progress"
        subtitle="Received against the sale price"
        legend={[
          { label: 'Payments', color: 'var(--chart-1)', value: `Rs. ${data.paid.toLocaleString()}` },
          { label: 'Adjustment forms', color: '#ffc107', value: `Rs. ${data.forms.toLocaleString()}` },
          { label: data.remaining >= 0 ? 'Remaining' : 'Over-received', color: '#e5e1d3', value: `Rs. ${Math.abs(data.remaining).toLocaleString()}` },
        ]}
      >
        <div className="pl-progress-top">
          <strong>{data.price > 0 ? `${data.receivedPct.toFixed(1)}%` : 'No sale price'}</strong>
          <span>Rs. {data.received.toLocaleString()} of Rs. {data.price.toLocaleString()}</span>
        </div>
        <div ref={stackRef} className={`pl-stack ${stackSeen ? 'in' : ''}`} role="img" aria-label={`${data.receivedPct.toFixed(1)} percent received`}>
          <div className="pl-stack-seg" style={{ width: `${data.paidPct}%`, background: 'var(--chart-1)' }} />
          <div className="pl-stack-seg" style={{ width: `${data.formsPct}%`, background: '#ffc107' }} />
        </div>
      </ChartFrame>

      <div className="pl-split">
        <ChartFrame title="Payment timeline" subtitle="Each receipt and the running total against the sale price">
          {data.flow.length === 0 ? (
            <p className="wg-empty">No payments recorded for this deal yet.</p>
          ) : (
            <ul className="pl-flow">
              {data.flow.map((f) => (
                <li key={f.id}>
                  <span className="pl-flow-dot" />
                  <div className="pl-flow-main">
                    <strong>{f.label}</strong>
                    <span>{f.date}</span>
                  </div>
                  <div className="pl-flow-amount">Rs. {f.amount.toLocaleString()}</div>
                  <div className="pl-flow-cum">
                    <FillBar pct={f.cumPct} color={f.cumPct >= 100 ? 'var(--paid)' : 'var(--chart-2)'} />
                    <span>{Math.round(f.cumPct)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>

        <ChartFrame title="Payments by type" subtitle="Where the money received came from">
          {noPayments ? (
            <p className="wg-empty">No payments recorded for this deal yet.</p>
          ) : (
            <ul className="pl-rank">
              {data.types.map((t) => (
                <li key={t.label}>
                  <div className="pl-rank-head">
                    <strong>{t.label}</strong>
                    <span>Rs. {t.amount.toLocaleString()} · {t.count} {t.count === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <FillBar pct={data.typeMax > 0 ? (t.amount / data.typeMax) * 100 : 0} color={t.color} />
                </li>
              ))}
            </ul>
          )}
        </ChartFrame>
      </div>
    </div>
  );
};

export default DealDetailInsights;
