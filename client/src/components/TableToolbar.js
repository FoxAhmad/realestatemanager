import React, { useMemo, useState } from 'react';
import { FaSearch, FaFilter, FaTimes } from 'react-icons/fa';
import './TableToolbar.css';

/**
 * columns: [{ key, label, type: 'text'|'number'|'currency'|'date'|'enum', accessor?: row => value, formatOption?: value => string }]
 * Only columns with a `type` participate in per-column filtering; the global search always
 * scans every listed column via its accessor (or row[key] when no accessor is given).
 */
export function useTableFilters(data, columns) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const getValue = (row, col) => (col.accessor ? col.accessor(row) : row[col.key]);

  const uniqueValues = useMemo(() => {
    const map = {};
    columns.forEach((col) => {
      if (col.type === 'enum') {
        const set = new Set();
        data.forEach((row) => {
          const v = getValue(row, col);
          if (v !== null && v !== undefined && v !== '') set.add(String(v));
        });
        map[col.key] = Array.from(set).sort();
      }
    });
    return map;
  }, [data, columns]);

  const filteredData = useMemo(() => {
    let rows = data;

    const term = search.trim().toLowerCase();
    if (term) {
      rows = rows.filter((row) =>
        columns.some((col) => {
          const v = getValue(row, col);
          if (v === null || v === undefined) return false;
          return String(v).toLowerCase().includes(term);
        })
      );
    }

    Object.entries(filters).forEach(([key, val]) => {
      if (val === undefined || val === null) return;
      const col = columns.find((c) => c.key === key);
      if (!col) return;

      if (col.type === 'number' || col.type === 'currency') {
        const { min, max } = val;
        if ((min === '' || min === undefined) && (max === '' || max === undefined)) return;
        rows = rows.filter((row) => {
          const num = parseFloat(getValue(row, col));
          if (isNaN(num)) return false;
          if (min !== '' && min !== undefined && num < parseFloat(min)) return false;
          if (max !== '' && max !== undefined && num > parseFloat(max)) return false;
          return true;
        });
      } else if (col.type === 'date') {
        const { from, to } = val;
        if (!from && !to) return;
        rows = rows.filter((row) => {
          const raw = getValue(row, col);
          if (!raw) return false;
          const d = new Date(raw);
          if (isNaN(d.getTime())) return false;
          if (from && d < new Date(from)) return false;
          if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            if (d > toDate) return false;
          }
          return true;
        });
      } else if (col.type === 'enum') {
        if (!val) return;
        rows = rows.filter((row) => String(getValue(row, col) ?? '') === val);
      } else {
        if (!val) return;
        const t = String(val).toLowerCase();
        rows = rows.filter((row) => {
          const raw = getValue(row, col);
          return raw !== null && raw !== undefined && String(raw).toLowerCase().includes(t);
        });
      }
    });

    return rows;
  }, [data, columns, search, filters]);

  const setFilter = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }));

  const clearFilters = () => {
    setFilters({});
    setSearch('');
  };

  const activeFilterCount = Object.values(filters).filter((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'object') return Object.values(v).some((x) => x !== '' && x !== undefined && x !== null);
    return v !== '';
  }).length;

  return {
    search,
    setSearch,
    filters,
    setFilter,
    clearFilters,
    filteredData,
    uniqueValues,
    showFilters,
    setShowFilters,
    activeFilterCount,
  };
}

export default function TableToolbar({
  columns,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  uniqueValues = {},
  showFilters,
  onToggleFilters,
  onClearFilters,
  activeFilterCount = 0,
  searchPlaceholder = 'Search...',
  resultCount,
}) {
  const filterableColumns = columns.filter((c) => c.type);

  return (
    <div className="table-toolbar">
      <div className="table-toolbar-row">
        <div className="table-search">
          <FaSearch className="table-search-icon" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button type="button" className="table-search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">
              <FaTimes />
            </button>
          )}
        </div>

        {filterableColumns.length > 0 && (
          <button
            type="button"
            className={`table-filter-toggle${showFilters ? ' active' : ''}`}
            onClick={onToggleFilters}
          >
            <FaFilter /> Filters
            {activeFilterCount > 0 && <span className="table-filter-count">{activeFilterCount}</span>}
          </button>
        )}

        {(activeFilterCount > 0 || search) && (
          <button type="button" className="table-filter-clear-all" onClick={onClearFilters}>
            Clear all
          </button>
        )}

        {typeof resultCount === 'number' && (
          <span className="table-result-count">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
        )}
      </div>

      {showFilters && filterableColumns.length > 0 && (
        <div className="table-filter-grid">
          {filterableColumns.map((col) => {
            if (col.type === 'enum') {
              return (
                <div className="table-filter-field" key={col.key}>
                  <label>{col.label}</label>
                  <select value={filters[col.key] || ''} onChange={(e) => onFilterChange(col.key, e.target.value)}>
                    <option value="">All</option>
                    {(uniqueValues[col.key] || []).map((v) => (
                      <option key={v} value={v}>
                        {col.formatOption ? col.formatOption(v) : v}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (col.type === 'number' || col.type === 'currency') {
              const val = filters[col.key] || { min: '', max: '' };
              return (
                <div className="table-filter-field" key={col.key}>
                  <label>{col.label}</label>
                  <div className="table-filter-range">
                    <input
                      type="number"
                      placeholder="Min"
                      value={val.min}
                      onChange={(e) => onFilterChange(col.key, { ...val, min: e.target.value })}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={val.max}
                      onChange={(e) => onFilterChange(col.key, { ...val, max: e.target.value })}
                    />
                  </div>
                </div>
              );
            }

            if (col.type === 'date') {
              const val = filters[col.key] || { from: '', to: '' };
              return (
                <div className="table-filter-field" key={col.key}>
                  <label>{col.label}</label>
                  <div className="table-filter-range">
                    <input type="date" value={val.from} onChange={(e) => onFilterChange(col.key, { ...val, from: e.target.value })} />
                    <span>–</span>
                    <input type="date" value={val.to} onChange={(e) => onFilterChange(col.key, { ...val, to: e.target.value })} />
                  </div>
                </div>
              );
            }

            return (
              <div className="table-filter-field" key={col.key}>
                <label>{col.label}</label>
                <input
                  type="text"
                  placeholder={`Filter ${col.label}`}
                  value={filters[col.key] || ''}
                  onChange={(e) => onFilterChange(col.key, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
