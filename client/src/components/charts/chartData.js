// Small helpers that turn page lists into the shapes the page chart components draw.

const MONTHS = 7;

// Counts rows per calendar month for the last `months` months, using row[dateKey].
export const monthlyCounts = (rows, dateKey, months = MONTHS) => {
  const now = new Date();
  const labels = [];
  const index = {};
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    index[`${d.getFullYear()}-${d.getMonth()}`] = labels.length;
    labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
  }
  const values = labels.map(() => 0);
  rows.forEach((r) => {
    const dt = new Date(r[dateKey]);
    if (Number.isNaN(dt.getTime())) return;
    const at = index[`${dt.getFullYear()}-${dt.getMonth()}`];
    if (at !== undefined) values[at] += 1;
  });
  return { labels, values };
};

export const pctOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
