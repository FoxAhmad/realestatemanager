// Turns the raw deals / payments / inventory lists into the shapes the dashboard widgets draw.

const MONTHS = 7;
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

const monthWindow = () => {
  const now = new Date();
  const out = [];
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: d.toLocaleDateString('en-US', { month: 'short' }) });
  }
  return out;
};

const num = (v) => parseFloat(v) || 0;

const pctChange = (last, prev) => (prev > 0 ? ((last - prev) / prev) * 100 : null);

const PLOT_STATUS = { available: 'available', assigned: 'booked', paid: 'booked', sold: 'sold' };

export const buildOverview = ({ deals, payments, inventory }) => {
  const months = monthWindow();
  const index = Object.fromEntries(months.map((m, i) => [m.key, i]));
  const collected = months.map(() => 0);
  const booked = months.map(() => 0);
  const dealsCreated = months.map(() => 0);

  const activeDeals = deals.filter((d) => d.status !== 'deal_not_done');
  const dealById = Object.fromEntries(deals.map((d) => [d.id, d]));

  const paidByDeal = {};
  payments.forEach((p) => {
    const amount = num(p.amount);
    paidByDeal[p.deal_id] = (paidByDeal[p.deal_id] || 0) + amount;
    const dt = new Date(p.payment_date);
    if (!Number.isNaN(dt.getTime()) && index[monthKey(dt)] !== undefined) collected[index[monthKey(dt)]] += amount;
  });

  deals.forEach((d) => {
    const dt = new Date(d.created_at);
    if (Number.isNaN(dt.getTime()) || index[monthKey(dt)] === undefined) return;
    dealsCreated[index[monthKey(dt)]] += 1;
    if (d.status !== 'deal_not_done') booked[index[monthKey(dt)]] += num(d.sale_price);
  });

  const totalCollected = payments.reduce((s, p) => s + num(p.amount), 0);
  const totalBooked = activeDeals.reduce((s, d) => s + num(d.sale_price), 0);
  const collectedOnActive = activeDeals.reduce((s, d) => s + (paidByDeal[d.id] || 0), 0);
  const outstanding = Math.max(totalBooked - collectedOnActive, 0);
  const collectionRate = totalBooked > 0 ? (collectedOnActive / totalBooked) * 100 : 0;

  // Plot map from every inventory item's plots.
  const plots = [];
  inventory.forEach((item) => {
    (item.plots || []).forEach((p) => {
      plots.push({
        key: `${item.id}-${p.plot_id}`,
        number: p.plot_number,
        status: PLOT_STATUS[p.plot_status] || 'available',
        project: item.project_name || '',
      });
    });
  });

  const dealStatus = (d) => {
    if (d.status === 'deal_not_done') return 'cancelled';
    if (d.status === 'deal_done') return 'done';
    const price = num(d.sale_price);
    return price > 0 && (paidByDeal[d.id] || 0) >= price ? 'paid' : 'progress';
  };

  const progress = deals
    .filter((d) => d.status === 'in_progress')
    .sort((a, b) => num(b.sale_price) - num(a.sale_price))
    .slice(0, 6)
    .map((d) => {
      const price = num(d.sale_price);
      const paid = paidByDeal[d.id] || 0;
      return {
        id: d.id,
        customer: d.customer_name || `Deal #${d.id}`,
        plot: d.plot_number,
        paid,
        pct: price > 0 ? (paid / price) * 100 : 0,
        status: dealStatus(d),
      };
    });

  const recent = [...payments]
    .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      customer: p.customer_name || (dealById[p.deal_id] && dealById[p.deal_id].customer_name) || `Deal #${p.deal_id}`,
      type: String(p.payment_type || 'payment').replace(/_/g, ' '),
      date: new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      amount: num(p.amount),
    }));

  const statusSegments = [
    { label: 'In progress', color: 'var(--pending)', count: deals.filter((d) => d.status === 'in_progress').length },
    { label: 'Completed', color: 'var(--paid)', count: deals.filter((d) => d.status === 'deal_done').length },
    { label: 'Cancelled', color: 'var(--overdue)', count: deals.filter((d) => d.status === 'deal_not_done').length },
  ];

  const last = MONTHS - 1;
  return {
    labels: months.map((m) => m.label),
    collected,
    booked,
    dealsCreated,
    totalCollected,
    outstanding,
    collectionRate,
    collectedDelta: pctChange(collected[last], collected[last - 1]),
    dealsDelta: pctChange(dealsCreated[last], dealsCreated[last - 1]),
    activeDealCount: deals.filter((d) => d.status === 'in_progress').length,
    plots,
    plotCounts: plots.reduce(
      (c, p) => {
        c[p.status] += 1;
        return c;
      },
      { available: 0, booked: 0, sold: 0 }
    ),
    progress,
    recent,
    statusSegments,
    dealTotal: deals.length,
  };
};
