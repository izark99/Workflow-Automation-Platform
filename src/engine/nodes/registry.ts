import { columnMappingNode } from './column-mapping';
import { filterNode } from './filter';
import { formulaColumnNode } from './formula-column';
import { lookupJoinNode } from './lookup-join';
import { groupByNode } from './group-by';
import { appendNode } from './append';
import { outputNode } from './output';
import { pivotNode } from './pivot';
import { dedupeNode } from './dedupe';
import { topNNode } from './top-n';
import { splitColumnNode } from './split-column';
import { cleanTextNode } from './clean-text';
import { sortNode } from './sort';
import { sqlNode } from './sql-node';
import { unpivotNode } from './unpivot';
import { inputFileNode } from './input-file';
import { referenceTableNode } from './reference-table';
import type { NodeRegistry } from './types';

/** Node modules by type. Each node task adds its module here. */
export const defaultRegistry: NodeRegistry = {
  input_file: inputFileNode,
  reference_table: referenceTableNode,
  column_mapping: columnMappingNode,
  filter: filterNode,
  formula_column: formulaColumnNode,
  lookup_join: lookupJoinNode,
  group_by: groupByNode,
  unpivot: unpivotNode,
  pivot: pivotNode,
  append: appendNode,
  sql: sqlNode,
  output: outputNode,
  sort: sortNode,
  dedupe: dedupeNode,
  top_n: topNNode,
  split_column: splitColumnNode,
  clean_text: cleanTextNode,
};
