import { columnMappingNode } from './column-mapping';
import { filterNode } from './filter';
import { formulaColumnNode } from './formula-column';
import { lookupJoinNode } from './lookup-join';
import { inputFileNode } from './input-file';
import type { NodeRegistry } from './types';

/** Node modules by type. Each node task adds its module here. */
export const defaultRegistry: NodeRegistry = {
  input_file: inputFileNode,
  column_mapping: columnMappingNode,
  filter: filterNode,
  formula_column: formulaColumnNode,
  lookup_join: lookupJoinNode,
};
