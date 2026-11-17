import { ColumnMappingForm } from './column-mapping-form';
import { FilterForm } from './filter-form';
import { InputFileForm } from './input-file-form';
import type { FormRegistry } from './types';

/** The settings form of each step type. T2.12 to T2.14 add the others. */
export const FORMS: FormRegistry = {
  input_file: InputFileForm,
  column_mapping: ColumnMappingForm,
  filter: FilterForm,
};
