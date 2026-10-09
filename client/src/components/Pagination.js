import React from 'react';
import './Pagination.css';

const SIZES = [10, 25, 50, 100];

// Page numbers with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20
const pageWindow = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((n) => pages.add(n));
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
};

/**
 * Pass the `pagination` object returned by useTableFilters:
 *   <Pagination {...pagination} />
 * Renders nothing when everything fits on one smallest-size page.
 */
const Pagination = ({ page, pageSize, total, totalPages, setPage, setPageSize }) => {
  if (total <= SIZES[0]) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pager" aria-label="Pagination">
      <div className="pager-info">
        Showing <strong>{from}–{to}</strong> of <strong>{total.toLocaleString()}</strong>
      </div>

      <div className="pager-controls">
        <button type="button" className="pager-btn" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        {pageWindow(page, totalPages).map((n) =>
          typeof n === 'string' ? (
            <span key={n} className="pager-gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pager-btn ${n === page ? 'active' : ''}`}
              onClick={() => setPage(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          )
        )}
        <button type="button" className="pager-btn" onClick={() => setPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          ›
        </button>
      </div>

      <label className="pager-size">
        Rows
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </nav>
  );
};

export default Pagination;

// For lists that are not fed by useTableFilters (derived or grouped rows).
// Call usePagerState() at the top of the component, then paginate(items, pager) where the rows are built.
export const usePagerState = (initialSize = 25) => {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSizeState] = React.useState(initialSize);
  return { page, setPage, pageSize, setPageSize: (n) => { setPageSizeState(n); setPage(1); } };
};

export const paginate = (items, pager) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pager.pageSize));
  const page = Math.min(pager.page, totalPages);
  return {
    pageItems: items.slice((page - 1) * pager.pageSize, page * pager.pageSize),
    pagination: { page, pageSize: pager.pageSize, total, totalPages, setPage: pager.setPage, setPageSize: pager.setPageSize },
  };
};
