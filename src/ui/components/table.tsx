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
  /** One line that is shortened with an ellipsis when the table is too narrow: the column gives up its width before the others do. The cell should carry the full text in a `title`. */
  ellipsis?: boolean;
}

export interface TableProps<T> {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** A long table that scrolls inside a box of this height (px). The box can take the focus, so the keyboard can scroll it. */
  maxHeight?: number;
  /** 36 px rows (and a 1 px divider) for a grid where the same data is edited; 44 px rows otherwise. */
  dense?: boolean;
}

/**
 * A sticky header of 40 px on `surface-overlay`, body rows of 44 px plus a 1 px divider (45 px; dense 36 plus 1), cells do not
 * wrap, numbers are right-aligned in tabular figures.
 */
export function Table<T>({ label, columns, rows, rowKey, maxHeight, dense = false }: TableProps<T>) {
  const cls = (base: string, align?: string) => (align === 'right' ? `${base} ${styles.right}` : base);
  return (
    <div className={`${styles.wrap} ${dense ? styles.dense : ''}`} data-dense={dense ? '' : undefined} {...(maxHeight === undefined ? {} : { style: { maxHeight, overflowY: 'auto' as const }, tabIndex: 0, role: 'region', 'aria-label': label })}>
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
                <td key={c.key} className={cls(styles.td ?? '', c.align)} style={c.ellipsis ? { maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }  : undefined} data-user-content={c.userContent ? '' : undefined}>
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
