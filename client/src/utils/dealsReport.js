/**
 * Deals — PDF exports.
 *
 *   1. buildDealsListPDF    — the deals register (whatever is currently visible
 *      on the Deals table: same search/filter scope as the on-screen list).
 *   2. buildDealProfilePDF  — a single deal's full statement: asset details,
 *      financial summary and the complete ledger (payments + form/adjustment
 *      entries), built straight from the data the Deal Profile page already
 *      has loaded so the PDF can never drift from what's on screen.
 */
import {
  createReport, money, rupees, shortDate, stampDate, slug, BRAND, GLYPH
} from './pdfReport';

const num = (v) => parseFloat(v) || 0;

const footFig = (value, extra = {}) => ({
  content: typeof value === 'string' ? value : money(value),
  styles: { halign: 'right', ...extra }
});

const DEAL_STATUS_LABELS = {
  in_progress: 'In Progress',
  deal_done: 'Completed',
  deal_not_done: 'Cancelled',
};

// ── Report 1: deals register ──────────────────────────────────────────────────

export function buildDealsListPDF({ deals, preparedBy }) {
  const list = deals || [];
  const totalBase = list.reduce((s, d) => s + num(d.original_price), 0);
  const totalSale = list.reduce((s, d) => s + num(d.sale_price), 0);

  const r = createReport({
    orientation: 'landscape',
    title: 'Deals Register',
    subtitle: `${list.length} ${list.length === 1 ? 'deal' : 'deals'}`
  });

  r.metaBar([
    ['Deals', String(list.length)],
    ['Total Sale Value', rupees(totalSale)],
    ['Prepared by', preparedBy || GLYPH.dash],
    ['Generated', stampDate()]
  ]);
  r.gap(14);

  r.tiles([
    { label: 'Total Deals', value: String(list.length), tone: 'primary' },
    { label: 'In Progress', value: String(list.filter(d => d.status === 'in_progress').length), tone: 'default' },
    { label: 'Completed', value: String(list.filter(d => d.status === 'deal_done').length), tone: 'success' },
    { label: 'Cancelled', value: String(list.filter(d => d.status === 'deal_not_done').length), tone: 'danger' },
    { label: 'Total Sale Value', value: rupees(totalSale), tone: 'success' }
  ]);
  r.gap(16);

  r.caption('Deal register');

  r.table({
    head: [['#', 'Customer', 'Salesperson', 'Asset', 'Plot #', 'Base Price', 'Sale Price', 'Status']],
    body: list.length
      ? list.map(d => [
          String(d.id),
          d.customer_name || GLYPH.none,
          d.dealer_name || GLYPH.none,
          [d.inventory_address, d.inventory_category].filter(Boolean).join(' · ') || GLYPH.none,
          d.plot_number || GLYPH.none,
          money(d.original_price),
          money(d.sale_price),
          DEAL_STATUS_LABELS[d.status] || d.status || GLYPH.none
        ])
      : [[{ content: 'No deals to display.', colSpan: 8, styles: { halign: 'center', textColor: BRAND.muted } }]],
    foot: [[
      { content: 'Totals', colSpan: 5, styles: { halign: 'right' } },
      footFig(totalBase),
      footFig(totalSale),
      ''
    ]],
    columnStyles: {
      0: { cellWidth: 30, halign: 'center', textColor: BRAND.muted },
      4: { cellWidth: 64, halign: 'center' },
      5: { cellWidth: 84, halign: 'right' },
      6: { cellWidth: 84, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 74, halign: 'center' }
    }
  });

  r.save(`Deals-Register_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Report 2: single deal profile & statement ─────────────────────────────────

export function buildDealProfilePDF({ deal, payments, adjustments, preparedBy }) {
  const pays = payments || [];
  const adjs = adjustments || [];

  const totalPaid = pays.reduce((s, p) => s + num(p.amount), 0);
  const cashPaid = pays
    .filter(p => p.payment_type === 'installment')
    .reduce((s, p) => s + num(p.amount), 0);
  const totalAdjusted = adjs.reduce((s, a) => s + num(a.customer_price), 0);
  const totalForms = adjs.reduce((s, a) => s + (parseInt(a.quantity, 10) || 0), 0);
  const totalAmountPaid = totalPaid + totalAdjusted;
  const remaining = num(deal.sale_price) - totalAmountPaid;

  const r = createReport({
    orientation: 'landscape',
    title: `Deal Profile #${deal.id}`,
    subtitle: deal.customer_name || ''
  });

  r.metaBar([
    ['Deal ID', `#${deal.id}`],
    ['Customer', deal.customer_name || GLYPH.dash],
    ['Salesperson', deal.dealer_name || GLYPH.dash],
    ['Status', DEAL_STATUS_LABELS[deal.status] || deal.status || GLYPH.dash],
    ['Prepared by', preparedBy || GLYPH.dash],
    ['Generated', stampDate()]
  ]);
  r.gap(14);

  r.tiles([
    { label: 'Sale Price', value: rupees(deal.sale_price), tone: 'primary' },
    { label: 'Cash Paid', value: rupees(cashPaid), hint: 'From installments', tone: 'success' },
    { label: 'Forms Paid', value: rupees(totalAdjusted), hint: `${totalForms} ${totalForms === 1 ? 'form' : 'forms'}`, tone: 'default' },
    { label: 'Total Amount Paid', value: rupees(totalAmountPaid), tone: 'success' },
    { label: 'Remaining', value: rupees(remaining), tone: remaining > 0 ? 'danger' : 'success' }
  ]);
  r.gap(16);

  // ── Asset details ──
  r.caption('Asset details');
  const plots = deal.plots || [];
  if (plots.length) {
    r.table({
      head: [['Plot #', 'Size', 'Block', 'Category', 'Type', 'Membership #', 'Registration #', 'Form #']],
      body: plots.map(p => [
        p.plot_number || GLYPH.none,
        p.size || GLYPH.none,
        p.block || GLYPH.none,
        (p.plot_category || 'standard').replace('_', ' '),
        p.plot_type === 'C' ? 'Commercial' : 'Residential',
        p.membership_no || GLYPH.none,
        p.registration_no || GLYPH.none,
        p.form_number || GLYPH.none
      ])
    });
  } else {
    r.table({
      head: [['Address', 'Category', 'Plot Info']],
      body: [[deal.inventory_address || GLYPH.none, deal.inventory_category || GLYPH.none, deal.plot_info || GLYPH.none]]
    });
  }
  r.gap(18);

  // ── Ledger entries: payments + form/adjustment entries, oldest first ──
  r.caption('Ledger entries', 'Oldest first');

  const adjByPayment = {};
  const unlinkedAdjustments = [];
  adjs.forEach(a => {
    if (a.payment_id) adjByPayment[a.payment_id] = a;
    else unlinkedAdjustments.push(a);
  });

  const entries = [
    ...unlinkedAdjustments.map(a => ({ kind: 'adjustment', date: a.transaction_date, raw: a })),
    ...pays.map(p => ({ kind: 'payment', date: p.payment_date, raw: p, linked: adjByPayment[p.id] })),
  ].sort((x, y) => new Date(x.date) - new Date(y.date));

  const rows = [];
  entries.forEach((e) => {
    if (e.kind === 'adjustment') {
      const a = e.raw;
      rows.push([
        shortDate(a.transaction_date),
        `FORM / ADJUSTMENT${a.quantity > 1 ? ` (${a.quantity})` : ''}`,
        a.voucher_no || GLYPH.none,
        [a.user_name, a.description].filter(Boolean).join(' - ') || GLYPH.none,
        money(a.customer_price)
      ]);
      return;
    }

    const p = e.raw;
    const label = p.payment_type === 'installment' && p.installment_no
      ? `${p.installment_no} INSTALLMENT`
      : String(p.payment_type || '').replace(/_/g, ' ').toUpperCase();
    rows.push([
      shortDate(p.payment_date),
      label,
      [p.instrument ? p.instrument.replace(/_/g, ' ').toUpperCase() : null, p.instrument_number, p.voucher_no]
        .filter(Boolean).join(' · ') || GLYPH.none,
      p.notes || GLYPH.none,
      money(p.amount)
    ]);

    if (e.linked) {
      rows.push([
        '',
        `${GLYPH.child} FORM / ADJUSTMENT${e.linked.quantity > 1 ? ` (${e.linked.quantity})` : ''}`,
        e.linked.voucher_no || GLYPH.none,
        e.linked.description || GLYPH.none,
        money(e.linked.customer_price)
      ]);
    }
  });

  r.table({
    head: [['Date', 'Type', 'Instrument / Voucher', 'Notes', 'Amount']],
    body: rows.length
      ? rows
      : [[{ content: 'No financial records found for this deal.', colSpan: 5, styles: { halign: 'center', textColor: BRAND.muted } }]],
    foot: [[
      { content: 'Total amount paid', colSpan: 4, styles: { halign: 'right' } },
      footFig(totalAmountPaid)
    ]],
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 140 },
      2: { cellWidth: 140, fontSize: 7.4 },
      4: { cellWidth: 84, halign: 'right', fontStyle: 'bold' }
    }
  });

  r.save(`Deal-Profile_${deal.id}_${slug(deal.customer_name)}_${new Date().toISOString().split('T')[0]}.pdf`);
}
