import { describe, expect, it } from 'vitest';
import { describeEngine } from './version';

describe('describeEngine', () => {
  it('returns the engine name', () => {
    expect(describeEngine()).toBe('data-flow-engine');
  });
});
