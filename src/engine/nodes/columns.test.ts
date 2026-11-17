import { describe, expect, it } from 'vitest';
import { EngineError } from '../types';
import { requireColumn } from './columns';

const cols = [
  { name: 'OT hours', type: 'number' as const },
  { name: 'Name', type: 'text' as const },
];

describe('requireColumn', () => {
  it('finds a column by its exact name', () => {
    expect(requireColumn(cols, 'OT hours').type).toBe('number');
  });

  it('is case-sensitive and names the right spelling', () => {
    try {
      requireColumn(cols, 'ot hours', 'n1');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      const err = e as EngineError;
      expect(err.code).toBe('unknown_column');
      expect(err.nodeId).toBe('n1');
      expect(err.message).toContain('"OT hours"');
      expect(err.message).toContain('case-sensitive');
    }
  });

  it('lists the available columns when nothing is close', () => {
    expect(() => requireColumn(cols, 'Salary')).toThrow(/Available columns: "OT hours", "Name"/);
  });
});
