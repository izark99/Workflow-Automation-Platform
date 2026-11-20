import { Dropdown } from '../../components';
import { useT } from '../../i18n';
import type { FormProps } from './types';

/** Settings of a Reference table step. A first form: the table, from the names of every table (T6.8 completes it). */
export function ReferenceTableForm({ step, context, onSettings, readOnly }: FormProps) {
  const t = useT();
  const table = typeof step.settings.table === 'string' ? step.settings.table : '';
  return (
    <Dropdown
      label={t('builder.referenceTable.table')}
      options={context.refTables.map((r) => ({ value: r.name, label: r.name }))}
      value={table}
      buttonLabel={table === '' ? t('builder.referenceTable.choose') : undefined}
      userContent
      disabled={readOnly}
      width="100%"
      onChange={(name) => onSettings({ ...step.settings, table: name })}
    />
  );
}
