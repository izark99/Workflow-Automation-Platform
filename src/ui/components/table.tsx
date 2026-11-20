import type { ReactNode } from 'react';
import styles from './table.module.css';

export interface Column<T> {
  key: string;
  header: string;
  /** Numbers are right-aligned. */
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  /** The header and the cells hold user data (column names, file content): the pseudo-locale rule does not expect catalog text. */
  userContent?: boolean;
  /** A fixed width in px. When any column has one, the table uses a fixed layout and the other columns share the rest. */
  width?: number;
}

export interface TableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** A long table that scrolls inside a box of this height (px). The box can take the focus, so the keyboard can scroll it. */
  maxHeight?: number;
}

/** Header cells 10/16 px, body rows 56 px plus a 1 px divider (57 px), cells do not wrap. */
export function Table<T>({ label, columns, rows, rowKey, maxHeight }: TableProps<T>) {
  const cls = (base: string, align?: string) => (align === 'right' ? `${base} ${styles.right}` : base);
  return (
    <div className={styles.wrap} {...(maxHeight === undefined ? {} : { style: { maxHeight, overflowY: 'auto' as const }, tabIndex: 0, role: 'region', 'aria-label': label })}>
      <table className={styles.table} aria-label={label} style={columns.some((c) => c.width !== undefined) ? { tableLayout: 'fixed' } : undefined}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={c.width !== undefined ? { width: c.width } : undefined} className={cls(styles.th ?? '', c.align)} data-user-content={c.userContent ? '' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cls(styles.td ?? '', c.align)} data-user-content={c.userContent ? '' : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
