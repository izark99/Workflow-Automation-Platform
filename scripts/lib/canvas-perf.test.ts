import { describe, expect, it } from 'vitest';
import { frameGaps, percentile, renderPerfReport, summarizeDrag, type DragMeasurement } from './canvas-perf.ts';

describe('percentile', () => {
  it('takes the nearest rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile([7], 95)).toBe(7);
  });
  it('does not change its input and is 0 for no values', () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('frameGaps', () => {
  it('is the time between two frames', () => {
    expect(frameGaps([0, 16, 33, 66])).toEqual([16, 17, 33]);
    expect(frameGaps([5])).toEqual([]);
  });
});

const sample = (over: Partial<DragMeasurement> = {}): DragMeasurement => ({
  label: '12 steps',
  steps: 12,
  frameTimes: [0, 16, 32, 48, 100],
  renders: { BuilderScreen: 61, SettingsPanel: 61, StepList: 61, StepCard: 732 },
  rendersBefore: { BuilderScreen: 1, SettingsPanel: 1, StepList: 1, StepCard: 12 },
  visibleBefore: 12,
  visibleDuring: 12,
  visibleAfter: 12,
  screenshot: 'canvas-perf/12-steps-middle.png',
  ...over,
});

describe('summarizeDrag', () => {
  it('gives p95 and the maximum of the frame gaps and the renders added by the drag', () => {
    const s = summarizeDrag(sample());
    expect(s.frames).toBe(5);
    expect(s.p95).toBe(52);
    expect(s.max).toBe(52);
    expect(s.added).toEqual({ BuilderScreen: 60, SettingsPanel: 60, StepList: 60, StepCard: 720 });
    expect(s.allVisible).toBe(true);
  });
  it('reports a card that went missing', () => {
    expect(summarizeDrag(sample({ visibleDuring: 11 })).allVisible).toBe(false);
  });
});

describe('renderPerfReport', () => {
  it('is a table with one row per measurement and says how it was made', () => {
    const md = renderPerfReport([sample(), sample({ label: '60 steps', steps: 60 })], { generatedAt: '2026-11-20', moves: 60 });
    expect(md).toContain('# Canvas drag measurements');
    expect(md).toContain('npm run perf:canvas');
    expect(md).toContain('| 12 steps |');
    expect(md).toContain('| 60 steps |');
    expect(md).toContain('60 moves');
  });
});
