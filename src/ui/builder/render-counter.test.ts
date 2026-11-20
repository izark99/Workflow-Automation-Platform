import { afterEach, describe, expect, it } from 'vitest';
import { countRender, readRenderCounts, resetRenderCounts } from './render-counter';

afterEach(() => resetRenderCounts());

describe('render counter', () => {
  it('counts nothing when the flag is off (the release build)', () => {
    countRender('StepList', false);
    expect(readRenderCounts()).toEqual({});
  });
  it('counts per part when the flag is on', () => {
    countRender('StepList', true);
    countRender('StepList', true);
    countRender('StepCard', true);
    expect(readRenderCounts()).toEqual({ StepList: 2, StepCard: 1 });
  });
  it('can be reset', () => {
    countRender('StepList', true);
    resetRenderCounts();
    expect(readRenderCounts()).toEqual({});
  });
});
