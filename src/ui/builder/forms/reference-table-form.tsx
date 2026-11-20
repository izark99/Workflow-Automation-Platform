import { Dropdown, ErrorState, QuietWarning } from '../../components';
import { useT } from '../../i18n';
import { coverageGaps, formatDate } from '../../../engine/versions';
import { gapLine } from '../../date-check';
import { referenceTableInfo } from './reference-table-logic';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/**
 * Settings of a Reference table step: the table, the columns of the version used and the version used on the test date.
 * The date is the one of the Test tab, shared by the builder.
 */
export function ReferenceTableForm({ step, context, onSettings, readOnly }: FormProps) {
  const t = useT();
  const table = typeof step.settings.table === 'string' ? step.settings.table : '';
  const date = context.testDate;
  const info = referenceTableInfo(context.refTables, table, date);
  const options = context.refTables.map((r) => ({ value: r.name, label: r.name }));
  // Before a table is chosen the button says so: the placeholder is a real option, so the name of the control holds its text.
  if (table === '') options.unshift({ value: '', label: t('builder.referenceTable.choose') });
  // A name that is not in the list stays visible, so the person sees what the step points at.
  if (table !== '' && !options.some((o) => o.value === table)) options.push({ value: table, label: table });
  // The date check for this table over the whole range of the flow version (the test date shows one day of it).
  const chosen = context.refTables.find((r) => r.name === table);
  const gaps = context.coverage && chosen && !(context.coverage.skipEmpty && chosen.versions.length === 0) ? coverageGaps(context.coverage.range, chosen.versions).map((g) => gapLine({ table, ...g })) : [];
  const columns = info.kind === 'ready' || info.kind === 'no_version' ? info.columns : [];
  return (
    <div className={styles.stack} style={{ paddingTop: 0 }}>
      <Dropdown
        label={t('builder.referenceTable.table')}
        options={options}
        value={table}
        userContent={table !== ''}
        disabled={readOnly}
        width="100%"
        onChange={(name) => name !== '' && onSettings({ ...step.settings, table: name })}
      />
      {info.kind === 'missing' ? <ErrorState what={t('builder.referenceTable.missing', { name: info.name })} next={t('builder.referenceTable.missingNext')} /> : null}
      {info.kind === 'unreadable' ? (
        <p className={styles.note} role="status">
          {t('builder.referenceTable.unreadable')}
        </p>
      ) : null}
      {info.kind === 'no_version' ? <ErrorState what={info.message} next={t('builder.referenceTable.noVersionNext')} /> : null}
      {info.kind === 'ready' ? (
        <p className={styles.note} role="status">
          {t('builder.referenceTable.version', { date: formatDate(date), n: info.versionNo, range: info.range })}
        </p>
      ) : null}
      <QuietWarning lines={gaps} />
      {columns.length > 0 ? (
        <section aria-label={t('builder.referenceTable.columns')}>
          <h3 className={styles.listTitle}>{t('builder.referenceTable.columns')}</h3>
          <ul className={styles.columnList}>
            {columns.map((c) => (
              <li key={c.name}>
                <span data-user-content>{c.name}</span>
                <span className={styles.columnType}>{t(`refTables.import.type.${c.type}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
