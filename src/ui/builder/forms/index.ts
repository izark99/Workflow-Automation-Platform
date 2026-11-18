import { AppendForm } from './append-form';
import { ColumnMappingForm } from './column-mapping-form';
import { FilterForm } from './filter-form';
import { FormulaColumnForm } from './formula-column-form';
import { GroupByForm } from './group-by-form';
import { InputFileForm } from './input-file-form';
import { LookupForm } from './lookup-form';
import { OutputForm } from './output-form';
import { PivotForm } from './pivot-form';
import { SqlForm } from './sql-form';
import { UnpivotForm } from './unpivot-form';
import type { FormRegistry } from './types';

/** The settings form of each step type. */
export const FORMS: FormRegistry = {
  input_file: InputFileForm,
  column_mapping: ColumnMappingForm,
  filter: FilterForm,
  formula_column: FormulaColumnForm,
  lookup_join: LookupForm,
  group_by: GroupByForm,
  unpivot: UnpivotForm,
  pivot: PivotForm,
  append: AppendForm,
  output: OutputForm,
  sql: SqlForm,
};
