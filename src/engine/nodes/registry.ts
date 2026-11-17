import { columnMappingNode } from './column-mapping';
import { inputFileNode } from './input-file';
import type { NodeRegistry } from './types';

/** Node modules by type. Each node task adds its module here. */
export const defaultRegistry: NodeRegistry = {
  input_file: inputFileNode,
  column_mapping: columnMappingNode,
};
