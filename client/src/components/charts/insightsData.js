// Small helpers shared by the Deals / Deal detail / Payments chart blocks.
// Everything is derived from the lists those pages already fetch.

export const num = (v) => parseFloat(v) || 0;

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

const validDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// `count` consecutive months ending at the latest dated record (or this month when that is later/absent),
// so older imported data still shows up instead of an empty window.
export const buildMonthWindow = (dates, count = 7) => {
  const now = new Date();
  let end = new Date(now.getFullYear(), now.getMonth(), 1);
  dates.forEach((v) => {
    const d = validDate(v);
    if (d && d > end) end = new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push({
      key: monthKey(d),
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  const index = Object.fromEntries(months.map((m, i) => [m.key, i]));
  return { labels: months.map((m) => m.label), index };
};

// Adds `valueOf(item)` into the month bucket of `item[dateKey]`.
export const sumByMonth = (items, dateKey, valueOf, win) => {
  const out = win.labels.map(() => 0);
  items.forEach((item) => {
    const d = validDate(item[dateKey]);
    if (!d) return;
    const i = win.index[monthKey(d)];
    if (i !== undefined) out[i] += valueOf(item);
  });
  return out;
};

export const TYPE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  '#0e7490',
  '#7c3aed',
  '#64748b',
];

export const typeLabel = (t) =>
  ({
    booking: 'Booking / Down Payment',
    down_payment: 'Booking / Down Payment',
    installment: 'Instalments',
    excess_area: 'Excess Area',
    possession_fee: 'Possession Fee',
    form_fee: 'Form Fee',
    processing_fee: 'Processing Fee',
    other: 'General / Others',
  }[t] || String(t || 'other').replace(/_/g, ' '));

// Groups payments by type label -> [{ label, amount, count, color }] sorted by amount desc.
export const groupByType = (payments) => {
  const map = {};
  payments.forEach((p) => {
    const label = typeLabel(p.payment_type);
    if (!map[label]) map[label] = { label, amount: 0, count: 0 };
    map[label].amount += num(p.amount);
    map[label].count += 1;
  });
  return Object.values(map)
    .sort((a, b) => b.amount - a.amount)
    .map((g, i) => ({ ...g, color: TYPE_COLORS[i % TYPE_COLORS.length] }));
};
