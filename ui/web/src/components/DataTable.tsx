import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useDismiss } from '../hooks/useDismiss.ts';
import { Icon, type IconName } from './Icon.tsx';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number;
}

export interface RowAction {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}

interface Sort {
  key: string;
  dir: 'asc' | 'desc';
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  emptyText: string;
  initialSort?: Sort;
  /** Adds a checkbox column. */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** Adds a "⋯" menu at the end of each row. */
  rowActions?: (row: T) => RowAction[];
  pageSize?: number;
}

/** The one table used everywhere: sortable headers, pagination, optional selection and row menu. */
export function DataTable<T>(props: Props<T>) {
  const { rows, columns, rowKey, emptyText, selected, onSelectedChange, rowActions } = props;
  const pageSize = props.pageSize ?? 10;
  const [sort, setSort] = useState<Sort | undefined>(props.initialSort);
  const [page, setPage] = useState(0);

  const sorted = sortRows(rows, columns, sort);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (key: string): void =>
    setSort((s) => ({ key, dir: s?.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const selectable = selected && onSelectedChange;
  const pageKeys = visible.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected?.has(k));
  const togglePage = (): void => {
    if (!selectable) return;
    const next = new Set(selected);
    for (const k of pageKeys) {
      if (allOnPage) next.delete(k);
      else next.add(k);
    }
    onSelectedChange(next);
  };
  const toggleRow = (key: string): void => {
    if (!selectable) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  };

  return (
    <div className="table-card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={togglePage}
                    aria-label="Select all on this page"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key}>
                  {col.sortValue ? (
                    <button className="th-sort" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      <span
                        className={sort?.key === col.key ? `sort-icon ${sort.dir}` : 'sort-icon'}
                      >
                        <Icon name="sort" size={13} />
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
              {rowActions && <th className="col-actions" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td className="table-empty" colSpan={columns.length + 2}>
                  {emptyText}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} className={selected?.has(key) ? 'selected' : undefined}>
                  {selectable && (
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} data-label={col.label}>
                      {col.render(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="col-actions">
                      <RowMenu actions={rowActions(row)} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>
          Page {current + 1} of {pageCount}
          <span className="muted"> · {rows.length} total</span>
        </span>
        <div className="pager">
          <button
            className="btn btn-sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <button
            className="btn btn-sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function sortRows<T>(rows: T[], columns: Column<T>[], sort: Sort | undefined): T[] {
  const value = columns.find((c) => c.key === sort?.key)?.sortValue;
  if (!sort || !value) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (
      (typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y))) * sign
    );
  });
}

/** The "⋯" button. The menu is fixed-positioned so the scrolling table cannot clip it. */
function RowMenu({ actions }: { actions: RowAction[] }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setStyle(null), []);
  useDismiss(ref, style !== null, close);

  const open = (button: HTMLButtonElement): void => {
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > 160;
    setStyle({
      position: 'fixed',
      right: window.innerWidth - rect.right,
      ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
    });
  };

  return (
    <div ref={ref}>
      <button
        className="btn btn-sm btn-icon row-menu-button"
        onClick={(e) => (style ? close() : open(e.currentTarget))}
        aria-label="Row actions"
      >
        <Icon name="dots" size={16} />
      </button>
      {style && (
        <div className="menu" role="menu" style={style}>
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onClick();
              }}
            >
              <Icon name={action.icon} size={14} /> {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
