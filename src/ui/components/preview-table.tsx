import type { ReactNode } from 'react';
import table from './table.module.css';
import styles from './preview-table.module.css';

export interface PreviewTableColumn {
  header: string;
  /** Numbers are right-aligned. */
  align?: 'left' | 'right';
}

export interface PreviewTableProps {
  label: string;
  columns: PreviewTableColumn[];
  /** One array of cells per row, in the order of `columns`. The cells are the user's data. */
  rows: ReactNode[][];
  /** Adds the first column of row numbers, which stays in place while the table scrolls sideways. */
  rowNumbers?: boolean;
  /** The number of the first row shown, in the whole table: 1 for the first rows, the real number for the last rows. */
  firstRowNumber?: number;
  /** The row numbers of the rows, when they are not one run (a Find that keeps some rows). Overrides `firstRowNumber`. */
  numbers?: number[];
  /** Fills the height of its parent and scrolls inside it in both directions (the popup). Otherwise it is as high as its rows. */
  fill?: boolean;
}

/**
 * The table of a preview, shared by the Test tab and the popup (SPEC 15.3). The header row stays in place when the rows scroll;
 * with `rowNumbers` the first column does too. It looks like `Table`: 40 px header, 45 px rows, cells do not wrap.
 */
export function PreviewTable({ label, columns, rows, rowNumbers = false, firstRowNumber = 1, numbers, fill = false }: PreviewTableProps) {
  const cls = (base: string | undefined, align?: string) => (align === 'right' ? `${base ?? ''} ${table.right}` : (base ?? ''));
  return (
    // A box that scrolls can take the focus, so the keyboard can scroll it.
    <div className={fill ? styles.fill : table.wrap} {...(fill ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}>
      <table className={table.table} aria-label={label}>
        <thead>
          <tr>
            {rowNumbers ? (
              <th scope="col" className={`${table.th} ${styles.number} ${styles.corner}`}>
                <span className={styles.srOnly}>#</span>
              </th>
            ) : null}
            {columns.map((c, i) => (
              <th key={i} scope="col" className={cls(table.th, c.align)} data-user-content="">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {rowNumbers ? (
                <th scope="row" className={`${table.td} ${styles.number}`}>
                  {(numbers?.[r] ?? firstRowNumber + r).toLocaleString('en-US')}
                </th>
              ) : null}
              {cells.map((cell, i) => (
                <td key={i} className={cls(table.td, columns[i]?.align)} data-user-content="">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
