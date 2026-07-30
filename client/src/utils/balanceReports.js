/**
 * Manage Balances — PDF exports.
 *
 * Both reports are built from the transaction list the page already has in
 * memory, so a print always matches exactly what is on screen (same account
 * tab, same project scope, same attribution).
 *
 *   1. buildDealerSharesPDF  — every included dealer/party gets a section: their
 *      share of the account balance followed by the payment logs behind it.
 *   2. buildTotalSummaryPDF  — account-level totals, the dealer share split, and
 *      the complete ledger with each entry's payment logs nested beneath it.
 *
 * Attribution (buildDealerLedgers) mirrors the on-screen dealer cards exactly so
 * the printed shares can never drift from the UI:
 *   • An entry WITH linked finance entries is attributed to the owners of those
 *     linked entries, by the linked amount (always a credit — money moved in).
 *   • An entry WITHOUT linked entries is attributed to its own dealer/customer,
 *     by its debit/credit.
 *   • Anything matching neither rule stays unattributed and is reported as a
 *     separate "Unattributed / System" line so the shares still foot to the
 *     account balance.
 */
import {
  createReport, money, rupees, shortDate, stampDate, slug, BRAND, GLYPH
} from './pdfReport';

const CERT_ACCOUNT = 8; // Advance for Certificate — the only account tracking form counts

const num = (v) => parseFloat(v) || 0;

/**
 * A footer figure. autoTable does not carry `columnStyles` alignment onto foot
 * cells that sit after a colSpan cell, so totals have to state their own
 * alignment or they drift left of the column they belong to.
 */
const footFig = (value, extra = {}) => ({
  content: typeof value === 'string' ? value : money(value),
  styles: { halign: 'right', ...extra }
});

/** Keeps "-" placeholders from inheriting the debit/credit red and green. */
const mutePlaceholders = (data) => {
  if (data.section === 'body' && data.cell.raw === GLYPH.none) {
    data.cell.styles.textColor = BRAND.muted;
  }
};

/** Every party name attached to an entry, e.g. "Ali Raza, Sana (Client)". */
export const entryParties = (t) => {
  const names = new Set();
  if (t.customer_name) names.add(`${t.customer_name} (Client)`);
  else if (t.user_name) names.add(t.user_name);
  if (t.linked_entries) {
    t.linked_entries.forEach(e => {
      if (e.customer_name) names.add(`${e.customer_name} (Client)`);
      else if (e.user_name) names.add(e.user_name);
    });
  }
  return Array.from(names).join(', ') || 'System / Admin';
};

/**
 * Per-party share of an account, with the payment logs that make it up.
 *
 * Returns one object per party that has a non-zero share (or, on the
 * certificate account, a non-zero form count), each with a `logs` array sorted
 * oldest-first and a running balance on every log.
 */
export function buildDealerLedgers({ transactions, entities, activeTab, adjustmentCost }) {
  const isCert = activeTab === CERT_ACCOUNT;
  const formCost = num(adjustmentCost) || 1;

  return entities.map(d => {
    const logs = [];
    let balance = 0;
    let quantity = 0;

    transactions.forEach(t => {
      const linked = t.linked_entries
        ? t.linked_entries.filter(e => e.user_name === d.name || (e.customer_name && e.customer_name === d.name))
        : [];

      if (linked.length > 0) {
        const contributed = linked.reduce((sum, e) => sum + num(e.amount), 0);
        balance += contributed;
        if (isCert) quantity += Math.round(contributed / formCost) || 0;

        linked.forEach(e => {
          logs.push({
            date: e.date || t.transaction_date,
            voucher: t.voucher_no || '-',
            instrument: `${t.instrument || ''} ${t.instrument_number || ''}`.trim() || '-',
            source: 'Finance transfer',
            description: e.description || t.description || '-',
            batch: t.description || '',
            debit: 0,
            credit: num(e.amount),
            hasProof: Boolean(e.proof_file || t.proof_file)
          });
        });
      } else if (!t.linked_entries || t.linked_entries.length === 0) {
        if (t.user_id === d.id || t.customer_id === d.id) {
          balance += num(t.credit) - num(t.debit);
          const q = parseInt(t.quantity, 10) || 0;
          if (num(t.credit) > 0) quantity += q;
          if (num(t.debit) > 0) quantity -= q;

          logs.push({
            date: t.transaction_date,
            voucher: t.voucher_no || '-',
            instrument: `${t.instrument || ''} ${t.instrument_number || ''}`.trim() || '-',
            source: 'Direct entry',
            description: t.description || '-',
            batch: [t.customer_info, t.plot_info].filter(Boolean).join(' · '),
            quantity: parseInt(t.quantity, 10) || null,
            debit: num(t.debit),
            credit: num(t.credit),
            hasProof: Boolean(t.proof_file)
          });
        }
      }
    });

    logs.sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    logs.forEach(l => { running += l.credit - l.debit; l.running = running; });

    return { ...d, balance, quantity, logs, isCustomer: !d.role };
  }).filter(d => d.balance !== 0 || (isCert && d.quantity !== 0));
}

// ── Shared report scaffolding ─────────────────────────────────────────────────

/** Labels both reports show in their meta strip. */
const reportContext = ({ projectName, preparedBy }) => ({
  projectLabel: projectName || 'General / Unassigned',
  preparedBy: preparedBy || GLYPH.dash
});

/**
 * The "who holds what" table — identical in both reports so the two prints can
 * be laid side by side.
 *
 * Percentages are a share of the account closing balance, and any amount that
 * belongs to no party is listed as its own row, so the column always foots to
 * the balance shown on screen rather than to a subtotal.
 */
const shareTable = (r, { ledgers, isCert, totalBalance, note }) => {
  const totalAttributed = ledgers.reduce((s, d) => s + d.balance, 0);
  const unattributed = totalBalance - totalAttributed;
  const base = totalBalance || totalAttributed;
  const pct = (v) => (base ? `${((v / base) * 100).toFixed(1)}%` : '—');
  const cols = isCert ? 7 : 6;
  const shareCol = isCert ? 5 : 4;

  const body = ledgers.map((d, i) => [
    String(i + 1),
    d.name,
    d.isCustomer ? 'Client' : 'Dealer',
    String(d.logs.length),
    ...(isCert ? [String(d.quantity)] : []),
    money(d.balance),
    pct(d.balance)
  ]);

  if (Math.abs(unattributed) >= 1) {
    body.push([
      '',
      'Unattributed / System',
      '—',
      '—',
      ...(isCert ? ['—'] : []),
      money(unattributed),
      pct(unattributed)
    ]);
  }

  const columnStyles = {
    0: { cellWidth: 26, halign: 'center', textColor: BRAND.muted },
    1: { fontStyle: 'bold' },
    2: { cellWidth: 54, halign: 'center' },
    3: { cellWidth: 66, halign: 'center' }
  };
  if (isCert) {
    columnStyles[4] = { cellWidth: 50, halign: 'center' };
    columnStyles[5] = { cellWidth: 92, halign: 'right', fontStyle: 'bold' };
    columnStyles[6] = { cellWidth: 58, halign: 'right' };
  } else {
    columnStyles[4] = { cellWidth: 100, halign: 'right', fontStyle: 'bold' };
    columnStyles[5] = { cellWidth: 62, halign: 'right' };
  }

  r.table({
    head: [[
      '#', 'Dealer / Party', 'Type', 'Payment logs',
      ...(isCert ? ['Forms'] : []),
      'Share (Rs.)', 'Share %'
    ]],
    body: body.length
      ? body
      : [[{ content: 'No party holds a share in this account.', colSpan: cols, styles: { halign: 'center', textColor: BRAND.muted } }]],
    foot: [[
      { content: 'Account closing balance', colSpan: shareCol, styles: { halign: 'right' } },
      footFig(totalBalance),
      footFig(base ? '100.0%' : GLYPH.dash)
    ]],
    columnStyles,
    // Green for a party in credit, red for an overdrawn one.
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === shareCol) {
        data.cell.styles.textColor = String(data.cell.raw).startsWith('(') ? BRAND.danger : BRAND.success;
      }
    }
  });

  if (note && Math.abs(unattributed) >= 1) r.note(note);
  return { totalAttributed, unattributed };
};

// ── Report 1: dealer shares with their payment logs ──────────────────────────

export function buildDealerSharesPDF({
  transactions, ledgers, activeTab, accountName, projectName, preparedBy, totalBalance
}) {
  const isCert = activeTab === CERT_ACCOUNT;
  const ctx = reportContext({ projectName, preparedBy });
  const totalLogs = ledgers.reduce((s, d) => s + d.logs.length, 0);

  const r = createReport({
    orientation: 'landscape',
    title: 'Dealer Shares & Payment Logs',
    subtitle: `${accountName}  ·  ${ctx.projectLabel}`
  });

  r.metaBar([
    ['Account', accountName],
    ['Project', ctx.projectLabel],
    ['Parties included', String(ledgers.length)],
    ['Payment logs', String(totalLogs)],
    ['Prepared by', ctx.preparedBy],
    ['Generated', stampDate()]
  ]);
  r.gap(14);

  // ── Share summary ──
  r.caption('Share summary', `${ledgers.length} ${ledgers.length === 1 ? 'party' : 'parties'} with an open share`);
  shareTable(r, {
    ledgers,
    isCert,
    totalBalance,
    note: 'Unattributed / System covers entries recorded without a dealer or client — most often legacy or '
      + 'head-office adjustments. It is listed so the party shares still reconcile to the account closing balance.'
  });

  // ── Per-party payment logs ──
  if (ledgers.length) {
    r.gap(18);
    r.caption('Payment logs by party', 'Oldest first — running balance is per party');
    r.gap(2);

    ledgers.forEach((d, i) => {
      const credits = d.logs.reduce((s, l) => s + l.credit, 0);
      const debits = d.logs.reduce((s, l) => s + l.debit, 0);

      r.sectionBar({
        index: i + 1,
        name: d.name,
        meta: [
          d.isCustomer ? 'Client' : 'Dealer',
          `${d.logs.length} payment ${d.logs.length === 1 ? 'log' : 'logs'}`,
          isCert ? `${d.quantity} forms` : null,
          d.phone || d.email || null
        ].filter(Boolean).join('   ·   '),
        valueLabel: isCert ? 'Share value' : 'Share',
        value: rupees(d.balance),
        tone: d.balance >= 0 ? 'success' : 'danger'
      });

      r.table({
        head: [['Date', 'Voucher', 'Instrument', 'Source', 'Narration', 'Debit', 'Credit', 'Balance']],
        body: d.logs.length ? d.logs.map(l => [
          shortDate(l.date),
          l.voucher,
          l.instrument,
          l.source,
          [
            l.description + (l.quantity ? `  (Qty ${l.quantity})` : ''),
            l.batch || null,
            l.hasProof ? '[proof attached]' : null
          ].filter(Boolean).join('\n'),
          l.debit > 0 ? money(l.debit) : GLYPH.none,
          l.credit > 0 ? money(l.credit) : GLYPH.none,
          money(l.running)
        ]) : [[{ content: 'No payment logs recorded.', colSpan: 8, styles: { halign: 'center', textColor: BRAND.muted } }]],
        foot: [[
          { content: 'Closing share', colSpan: 5, styles: { halign: 'right' } },
          footFig(debits),
          footFig(credits),
          footFig(d.balance)
        ]],
        continued: d.name,
        didParseCell: mutePlaceholders,
        columnStyles: {
          0: { cellWidth: 62 },
          1: { cellWidth: 62 },
          2: { cellWidth: 76 },
          3: { cellWidth: 78, textColor: BRAND.soft, fontSize: 7.2 },
          5: { cellWidth: 66, halign: 'right', textColor: BRAND.danger },
          6: { cellWidth: 66, halign: 'right', textColor: BRAND.success },
          7: { cellWidth: 74, halign: 'right', fontStyle: 'bold' }
        }
      });

      if (i < ledgers.length - 1) r.gap(16);
    });
  }

  r.save(`Dealer-Shares_${slug(accountName)}_${slug(ctx.projectLabel)}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Report 2: account summary with the full payment log register ─────────────

export function buildTotalSummaryPDF({
  transactions, ledgers, activeTab, accountName, projectName, preparedBy, totalBalance, totalQuantity
}) {
  const isCert = activeTab === CERT_ACCOUNT;
  const ctx = reportContext({ projectName, preparedBy });
  const totalAttributed = ledgers.reduce((s, d) => s + d.balance, 0);
  const totalDebit = transactions.reduce((s, t) => s + num(t.debit), 0);
  const totalCredit = transactions.reduce((s, t) => s + num(t.credit), 0);
  const logCount = transactions.reduce((s, t) => s + (t.linked_entries ? t.linked_entries.length : 0), 0);

  const r = createReport({
    orientation: 'landscape',
    title: 'Balance Summary & Payment Log Register',
    subtitle: `${accountName}  ·  ${ctx.projectLabel}`
  });

  r.metaBar([
    ['Account', accountName],
    ['Project', ctx.projectLabel],
    ['Entries', String(transactions.length)],
    ['Linked payment logs', String(logCount)],
    ['Prepared by', ctx.preparedBy],
    ['Generated', stampDate()]
  ]);
  r.gap(14);

  r.tiles([
    {
      label: 'Closing balance',
      value: rupees(totalBalance),
      hint: `${transactions.length} ledger ${transactions.length === 1 ? 'entry' : 'entries'}`,
      tone: totalBalance >= 0 ? 'success' : 'danger'
    },
    { label: 'Total credit', value: rupees(totalCredit), hint: 'Money in', tone: 'success' },
    { label: 'Total debit', value: rupees(totalDebit), hint: 'Money out', tone: 'danger' },
    {
      label: 'Parties',
      value: String(ledgers.length),
      hint: `${money(totalAttributed)} attributed`,
      tone: 'primary'
    },
    isCert ? { label: 'Certificates', value: `${totalQuantity ?? 0} forms`, hint: 'Net form count', tone: 'primary' } : null
  ]);
  r.gap(16);

  // ── Dealer share split ──
  r.caption('Dealer share split', 'Per-party payment logs are in the Dealer Shares export');
  shareTable(r, { ledgers, isCert, totalBalance });
  r.gap(18);

  // ── Complete ledger, payment logs nested under their entry ──
  r.caption('Complete ledger with payment logs', `Newest first  ·  ${GLYPH.child} rows are linked payment logs`);

  const rows = [];
  transactions.forEach((t, idx) => {
    // Newest-first list: the balance as at this row is the sum of this row and everything older.
    const running = transactions.slice(idx).reduce((sum, x) => sum + num(x.credit) - num(x.debit), 0);
    const narration = [
      (t.description || '-') + (t.quantity ? `  (Qty ${t.quantity})` : ''),
      [t.customer_info, t.plot_info].filter(Boolean).join(' · ') || null,
      t.proof_file ? '[proof attached]' : null
    ].filter(Boolean).join('\n');

    rows.push([
      shortDate(t.transaction_date),
      [t.voucher_no || GLYPH.none, `${t.instrument || ''} ${t.instrument_number || ''}`.trim()].filter(Boolean).join('\n'),
      narration,
      entryParties(t),
      num(t.debit) > 0 ? money(t.debit) : GLYPH.none,
      num(t.credit) > 0 ? money(t.credit) : GLYPH.none,
      money(running)
    ]);

    // Payment logs nested under the entry they were transferred in on.
    // `colSpan` is a cell property, not a style — nesting it under `styles`
    // silently drops it and shifts every later cell one column left.
    (t.linked_entries || []).forEach(e => {
      const sub = (content, { colSpan, ...style } = {}) => ({
        content,
        ...(colSpan ? { colSpan } : {}),
        styles: {
          fillColor: [250, 251, 255],
          textColor: BRAND.soft,
          fontSize: 7.2,
          lineColor: BRAND.line,
          ...style
        }
      });
      rows.push([
        sub(GLYPH.child, { halign: 'center', textColor: BRAND.primary, fontStyle: 'bold' }),
        sub(`${shortDate(e.date)}   ${GLYPH.dot}   ${e.description || 'Finance entry'}`, { colSpan: 2, fontStyle: 'italic' }),
        sub(e.customer_name ? `${e.customer_name} (Client)` : (e.user_name || GLYPH.dash)),
        sub(GLYPH.none, { halign: 'right' }),
        sub(money(e.amount), { halign: 'right', textColor: BRAND.success }),
        sub('')
      ]);
    });
  });

  r.table({
    head: [['Date', 'Voucher / Instrument', 'Narration', 'Dealer / Ref', 'Debit', 'Credit', 'Balance']],
    body: rows.length ? rows : [[{ content: 'No transactions recorded for this project.', colSpan: 7, styles: { halign: 'center', textColor: BRAND.muted } }]],
    foot: [[
      { content: 'Totals', colSpan: 4, styles: { halign: 'right' } },
      footFig(totalDebit),
      footFig(totalCredit),
      footFig(totalBalance)
    ]],
    continued: `${accountName} — ${ctx.projectLabel} ledger`,
    didParseCell: mutePlaceholders,
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 88, fontSize: 7.4 },
      3: { cellWidth: 118, fontSize: 7.6 },
      4: { cellWidth: 68, halign: 'right', textColor: BRAND.danger },
      5: { cellWidth: 68, halign: 'right', textColor: BRAND.success },
      6: { cellWidth: 74, halign: 'right', fontStyle: 'bold' }
    }
  });

  r.save(`Balance-Summary_${slug(accountName)}_${slug(ctx.projectLabel)}_${new Date().toISOString().split('T')[0]}.pdf`);
}
