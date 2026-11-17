import type { ReactNode } from 'react';
import styles from './table.module.css';

export interface Column<T> {
  key: string;
  header: string;
  /** Numbers are right-aligned. */
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

/** Header cells 10/16 px, body rows 56 px plus a 1 px divider (57 px), cells do not wrap. */
export function Table<T>({ label, columns, rows, rowKey }: TableProps<T>) {
  const cls = (base: string, align?: string) => (align === 'right' ? `${base} ${styles.right}` : base);
  return (
    <div className={styles.wrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cls(styles.th ?? '', c.align)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={cls(styles.td ?? '', c.align)}>
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
