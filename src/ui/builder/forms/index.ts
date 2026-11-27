import { AppendForm } from './append-form';
import { CleanForm } from './clean-form';
import { ColumnMappingForm } from './column-mapping-form';
import { DedupeForm } from './dedupe-form';
import { FilterForm } from './filter-form';
import { FormulaColumnForm } from './formula-column-form';
import { GroupByForm } from './group-by-form';
import { InputFileForm } from './input-file-form';
import { LookupForm } from './lookup-form';
import { OutputForm } from './output-form';
import { NotYetForm } from './not-yet-form';
import { PivotForm } from './pivot-form';
import { ReferenceTableForm } from './reference-table-form';
import { SortForm } from './sort-form';
import { SqlForm } from './sql-form';
import { SplitForm } from './split-form';
import { TopNForm } from './top-n-form';
import { UnpivotForm } from './unpivot-form';
import type { FormRegistry } from './types';

/** The settings form of each step type. */
export const FORMS: FormRegistry = {
  input_file: InputFileForm,
  reference_table: ReferenceTableForm,
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
  sort: SortForm,
  dedupe: DedupeForm,
  top_n: TopNForm,
  split_column: SplitForm,
  clean_text: CleanForm,
  check: NotYetForm,
  compare: NotYetForm,
};
