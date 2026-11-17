import { useState } from 'react';
import type { Column } from '../../../engine/types';
import { todayIso } from '../../screens/flows-logic';
import { loadSourceColumns } from './load-columns';
import type { FormProps } from './types';

export interface SourceColumns {
  /** Null until the columns are loaded. */
  columns: Column[] | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/** The columns of the table that feeds the step, loaded on request from the test files. */
export function useSourceColumns({ step, definition, context }: Pick<FormProps, 'step' | 'definition' | 'context'>): SourceColumns {
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setColumns(await loadSourceColumns(definition, step, context.testFiles, context.refTables, todayIso()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  return { columns, loading, error, load };
}
