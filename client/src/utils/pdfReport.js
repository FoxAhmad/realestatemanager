/**
 * Branded PDF report chrome.
 *
 * Every exported PDF in the app should look like it came out of the same
 * printer: same banner, same meta strip, same table theme, same numbered
 * footer. This module owns that look so report modules only describe their
 * *content* (see utils/balanceReports.js for the first two consumers).
 *
 * Usage:
 *   const r = createReport({ title: 'Dealer Shares', subtitle: 'Dealer Advances' });
 *   r.metaBar([['Project', 'Phase 1'], ['Generated', '30 Jul 2026']]);
 *   r.tiles([{ label: 'Balance', value: 'Rs. 1,200,000', tone: 'success' }]);
 *   r.table({ head: [[...]], body: [[...]] });
 *   r.save('My-Report.pdf');
 *
 * The banner is redrawn automatically on every page a table spills onto, and
 * `save()` stamps "Page X of Y" once the total page count is known.
 *
 * Units are PostScript points (72pt = 1in) — A4 landscape is 842 x 595pt.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const BRAND = {
  company: 'Universal Holdings',
  system: 'Digi Dealer Pro',
  notice: 'Confidential — for internal use only',

  primary: [84, 105, 212],      // --primary #5469d4
  primaryDark: [48, 64, 148],
  primaryTint: [242, 244, 253],
  ink: [30, 35, 45],
  soft: [98, 108, 125],
  muted: [140, 149, 163],
  line: [220, 225, 234],
  zebra: [248, 249, 252],
  success: [21, 115, 71],
  danger: [178, 42, 47]
};

export const MARGIN = 36;
const BANNER_H = 62;         // coloured band
const BANNER_RULE = 3;       // darker strip under the band
const TABLE_TOP = 92;        // top margin for continuation pages (clears banner + "continued" label)
const FOOTER_RESERVE = 40;

/**
 * jsPDF's built-in Helvetica is WinAnsi only, so anything outside that codepage
 * (arrows, most dashes) prints as garbage. These are the safe substitutes.
 */
export const GLYPH = {
  child: '»',   // » — marks a nested payment-log row
  dot: '·',     // ·
  dash: '—',    // —
  none: '-'
};

// ── Formatters ────────────────────────────────────────────────────────────────

/** 1234567.4 -> "1,234,567"; negatives in accounting parentheses. */
export const money = (value) => {
  const n = Number(value) || 0;
  const abs = Math.round(Math.abs(n)).toLocaleString('en-US');
  return n < 0 ? `(${abs})` : abs;
};

/** "Rs. 1,234,567" — for headline figures, not table columns. */
export const rupees = (value) => `Rs. ${money(value)}`;

/** "05 Jan 2026" — unambiguous for a mixed dd/mm vs mm/dd audience. */
export const shortDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "30 Jul 2026, 14:05" — used for the generated-on stamp. */
export const stampDate = (value = new Date()) => {
  const d = new Date(value);
  return `${shortDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Safe-for-filesystem slug: "Phase 1 / Block A" -> "Phase-1-Block-A". */
export const slug = (text) =>
  String(text || '').trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Report';

// ── Report builder ────────────────────────────────────────────────────────────

export function createReport({ orientation = 'landscape', title = 'Report', subtitle = '' } = {}) {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4', compress: true });

  const pageW = () => doc.internal.pageSize.getWidth();
  const pageH = () => doc.internal.pageSize.getHeight();
  const contentW = () => pageW() - MARGIN * 2;

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  /** One line of text, clipped to `width` with an ellipsis. */
  const clip = (text, width) => {
    const str = String(text == null ? '' : text);
    if (doc.getTextWidth(str) <= width) return str;
    let out = str;
    while (out.length > 1 && doc.getTextWidth(out + '…') > width) out = out.slice(0, -1);
    return out + '…';
  };

  const banner = () => {
    const W = pageW();
    setFill(BRAND.primary);
    doc.rect(0, 0, W, BANNER_H, 'F');
    setFill(BRAND.primaryDark);
    doc.rect(0, BANNER_H, W, BANNER_RULE, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(BRAND.company.toUpperCase(), MARGIN, 29);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(214, 221, 250);
    doc.text(`${BRAND.system}  ·  Balance Management`, MARGIN, 44);

    const rightEdge = W - MARGIN;
    const rightRoom = contentW() * 0.55;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(clip(title, rightRoom), rightEdge, 27, { align: 'right' });

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(214, 221, 250);
      doc.text(clip(subtitle, rightRoom), rightEdge, 44, { align: 'right' });
    }
  };

  const api = {
    doc,
    y: TABLE_TOP,
    contentW,

    /** Vertical gap. */
    gap(h = 12) {
      api.y += h;
      return api;
    },

    newPage() {
      doc.addPage();
      banner();
      api.y = TABLE_TOP;
      return api;
    },

    /** Break to a new page unless `needed` points of room are left. */
    ensureSpace(needed) {
      if (api.y + needed > pageH() - FOOTER_RESERVE) api.newPage();
      return api;
    },

    /**
     * Key/value strip under the banner: [['Account', 'Dealer Advances'], ...].
     * Columns are sized to their content so nothing collides.
     */
    metaBar(items) {
      const h = 30;
      const w = contentW();
      setFill(BRAND.primaryTint);
      doc.rect(MARGIN, api.y, w, h, 'F');
      setDraw(BRAND.line);
      doc.setLineWidth(0.5);
      doc.rect(MARGIN, api.y, w, h);

      const cells = items.filter(Boolean).map(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        const lw = doc.getTextWidth(String(label).toUpperCase());
        doc.setFontSize(9);
        const vw = doc.getTextWidth(String(value));
        return { label, value, width: Math.max(lw, vw) };
      });

      const pad = 12;
      const spacing = 22;
      const used = cells.reduce((s, c) => s + c.width, 0) + spacing * (cells.length - 1) + pad * 2;
      const overflow = Math.max(0, used - w);
      let x = MARGIN + pad;

      cells.forEach((c, i) => {
        const room = c.width - (overflow > 0 ? overflow / cells.length : 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(BRAND.muted);
        doc.text(clip(String(c.label).toUpperCase(), room), x, api.y + 12);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setText(BRAND.ink);
        doc.text(clip(String(c.value), room), x, api.y + 24);
        x += room + (i < cells.length - 1 ? spacing : 0);
      });

      api.y += h;
      return api;
    },

    /**
     * Headline figures as equal-width cards.
     * items: [{ label, value, hint, tone: 'default'|'success'|'danger'|'primary' }]
     */
    tiles(items) {
      const list = items.filter(Boolean);
      if (!list.length) return api;

      const h = 54;
      api.ensureSpace(h);
      const gutter = 10;
      const w = (contentW() - gutter * (list.length - 1)) / list.length;

      list.forEach((tile, i) => {
        const x = MARGIN + i * (w + gutter);
        const tone =
          tile.tone === 'success' ? BRAND.success :
          tile.tone === 'danger' ? BRAND.danger :
          tile.tone === 'primary' ? BRAND.primary : BRAND.soft;

        doc.setFillColor(255, 255, 255);
        setDraw(BRAND.line);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, api.y, w, h, 3, 3, 'FD');
        setFill(tone);
        doc.rect(x, api.y + 1, 3, h - 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(BRAND.muted);
        doc.text(clip(String(tile.label).toUpperCase(), w - 22), x + 12, api.y + 17);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        setText(tone);
        doc.text(clip(String(tile.value), w - 22), x + 12, api.y + 36);

        if (tile.hint) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          setText(BRAND.muted);
          doc.text(clip(String(tile.hint), w - 22), x + 12, api.y + 47);
        }
      });

      api.y += h;
      return api;
    },

    /** Small uppercase caption above a table. */
    caption(text, note) {
      api.ensureSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      setText(BRAND.ink);
      doc.text(String(text).toUpperCase(), MARGIN, api.y + 12);
      if (note) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setText(BRAND.muted);
        doc.text(clip(note, contentW() * 0.5), MARGIN + contentW(), api.y + 12, { align: 'right' });
      }
      setDraw(BRAND.line);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, api.y + 18, MARGIN + contentW(), api.y + 18);
      api.y += 24;
      return api;
    },

    /**
     * Section header for a per-entity block (one dealer, one project, ...).
     * { index, name, meta, valueLabel, value, tone }
     */
    sectionBar({ index, name, meta, valueLabel, value, tone = 'primary' }) {
      const h = 42;
      api.ensureSpace(h + 60); // keep the header with at least a couple of rows
      const w = contentW();
      const accent =
        tone === 'success' ? BRAND.success :
        tone === 'danger' ? BRAND.danger : BRAND.primary;

      setFill(BRAND.primaryTint);
      doc.roundedRect(MARGIN, api.y, w, h, 3, 3, 'F');
      setFill(accent);
      doc.rect(MARGIN, api.y + 1, 4, h - 2, 'F');

      const label = index != null ? `${index}.  ${name}` : String(name);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setText(BRAND.ink);
      doc.text(clip(label, w * 0.6), MARGIN + 14, api.y + (meta ? 19 : 26));

      if (meta) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setText(BRAND.soft);
        doc.text(clip(meta, w * 0.6), MARGIN + 14, api.y + 32);
      }

      if (value != null) {
        const right = MARGIN + w - 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(BRAND.muted);
        doc.text(String(valueLabel || 'TOTAL').toUpperCase(), right, api.y + 17, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        setText(accent);
        doc.text(String(value), right, api.y + 33, { align: 'right' });
      }

      api.y += h + 6;
      return api;
    },

    /**
     * Themed autoTable. Advances the cursor to the table's finalY.
     * Pass `continued: 'Ali Raza Traders'` to label the pages a table spills onto,
     * so a loose continuation page can still be identified.
     */
    table(config = {}) {
      const { styles, headStyles, footStyles, bodyStyles, didDrawPage, continued, ...rest } = config;

      autoTable(doc, {
        startY: api.y,
        theme: 'grid',
        margin: { left: MARGIN, right: MARGIN, top: TABLE_TOP, bottom: FOOTER_RESERVE },
        tableLineColor: BRAND.line,
        tableLineWidth: 0.5,
        // Totals are grand totals, not per-page subtotals — repeating them mid-table
        // (autoTable's default) reads as though the table had already ended.
        showFoot: 'lastPage',
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: { top: 4.5, right: 6, bottom: 4.5, left: 6 },
          textColor: BRAND.ink,
          lineColor: BRAND.line,
          lineWidth: 0.4,
          overflow: 'linebreak',
          valign: 'middle',
          ...styles
        },
        headStyles: {
          fillColor: BRAND.primaryDark,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
          lineColor: BRAND.primaryDark,
          ...headStyles
        },
        bodyStyles: { ...bodyStyles },
        footStyles: {
          fillColor: [235, 238, 248],
          textColor: BRAND.ink,
          fontStyle: 'bold',
          fontSize: 8,
          lineColor: BRAND.line,
          lineWidth: 0.4,
          ...footStyles
        },
        alternateRowStyles: { fillColor: BRAND.zebra },
        didDrawPage: (data) => {
          banner();
          if (continued && data.pageNumber > 1) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            setText(BRAND.soft);
            doc.text(clip(`${continued} — continued`, contentW()), MARGIN, TABLE_TOP - 10);
          }
          if (didDrawPage) didDrawPage(data);
        },
        ...rest
      });

      api.y = doc.lastAutoTable.finalY;
      return api;
    },

    /** Muted paragraph, e.g. a reconciliation note under a table. */
    note(text) {
      const lines = doc.splitTextToSize(String(text), contentW());
      api.ensureSpace(10 + lines.length * 10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setText(BRAND.soft);
      doc.text(lines, MARGIN, api.y + 12);
      api.y += 12 + (lines.length - 1) * 10;
      return api;
    },

    /** Numbers every footer, then downloads the file. */
    save(filename) {
      const total = doc.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        const W = pageW();
        const H = pageH();
        setDraw(BRAND.line);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, H - 28, W - MARGIN, H - 28);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setText(BRAND.muted);
        doc.text(BRAND.notice, MARGIN, H - 17);
        doc.text(BRAND.system, W / 2, H - 17, { align: 'center' });
        doc.text(`Page ${p} of ${total}`, W - MARGIN, H - 17, { align: 'right' });
      }
      doc.save(filename);
      return api;
    }
  };

  banner(); // first page
  return api;
}
