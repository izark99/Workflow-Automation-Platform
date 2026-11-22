import { describe, expect, it } from 'vitest';
import { topLayer } from './layers';

describe('the layer that Escape closes', () => {
  it('is the last one that opened', () => {
    const calls: string[] = [];
    const stack = [{ close: () => calls.push('dialog') }, { close: () => calls.push('list') }];
    topLayer(stack)?.close();
    expect(calls).toEqual(['list']);
  });
  it('is none when nothing is open', () => {
    expect(topLayer([])).toBeUndefined();
  });
});
