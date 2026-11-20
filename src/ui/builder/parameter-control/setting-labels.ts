import type { NodeType } from '../../../engine/flow/types';
import { translate } from '../../i18n';
import type { MessageKey } from '../../i18n';

/** The catalog key of the label that the form of each step shows for a setting that can take a parameter. */
export const SETTING_LABEL_KEYS: Readonly<Partial<Record<NodeType, Readonly<Record<string, MessageKey>>>>> = {
  input_file: { sheet: 'builder.form.input.sheet', headerRow: 'builder.form.input.headerRow', skipRows: 'builder.form.input.skipRows', rowNumberColumn: 'builder.form.input.rowNumberColumn' },
  formula_column: { name: 'builder.formula.name' },
  lookup_join: { onNoMatch: 'builder.join.onNoMatch' },
  unpivot: { nameColumn: 'builder.reshape.nameColumn', valueColumn: 'builder.reshape.valueColumn', skipBlank: 'builder.reshape.skipBlank' },
  pivot: { aggregation: 'builder.reshape.aggregation', fill: 'builder.reshape.fill', namePrefix: 'builder.reshape.prefix', nameSuffix: 'builder.reshape.suffix', nameCase: 'builder.reshape.nameCase' },
  append: { match: 'builder.append.match' },
  output: { file: 'builder.output.file', format: 'builder.output.format', sheet: 'builder.output.sheet' },
};

/** The label of a setting, in the current language; the setting's own name when it has none. */
export function settingLabel(type: NodeType, name: string): string {
  const key = SETTING_LABEL_KEYS[type]?.[name];
  return key ? translate(key) : name;
}
