import { describe, expect, it } from 'vitest';
import type { FlowDefinition, FlowNode } from './types';
import { alignNodes, arrangeLayout, distributeNodes, pointOf } from './arrange';

const W = 240;
const H = 56;
const node = (id: string, type: FlowNode['type'] = 'formula_column', x = 0, y = 0): FlowNode => ({ id, type, settings: {}, position: { x, y } });
const def = (nodes: FlowNode[], edges: FlowDefinition['edges']): FlowDefinition => ({ schemaVersion: 1, nodes, edges });
const opts = { width: W, height: H };

describe('arrangeLayout', () => {
  it('returns nothing for an empty flow', () => {
    expect(arrangeLayout(def([], []), opts)).toEqual({});
  });

  it('puts one step at the origin', () => {
    expect(arrangeLayout(def([node('a', 'input_file', 500, 500)], []), opts)).toEqual({ a: { x: 0, y: 0 } });
  });

  it('puts a chain in columns 80 px apart on one axis', () => {
    const p = arrangeLayout(def([node('a', 'input_file'), node('b'), node('c')], [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]), opts);
    expect(p.a).toEqual({ x: 0, y: 0 });
    expect(p.b).toEqual({ x: W + 80, y: 0 });
    expect(p.c).toEqual({ x: 2 * (W + 80), y: 0 });
  });

  it('uses the longest path for the column of a step', () => {
    const p = arrangeLayout(
      def([node('a', 'input_file'), node('b'), node('c', 'append')], [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c', targetHandle: 'in1' },
        { source: 'a', target: 'c', targetHandle: 'in2' },
      ]),
      opts,
    );
    expect(pointOf(p, 'c').x).toBe(2 * (W + 80));
  });

  it('stacks a diamond with 40 px between steps and centres the columns', () => {
    const p = arrangeLayout(
      def([node('a', 'input_file'), node('b'), node('c'), node('d', 'append')], [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'b', target: 'd', targetHandle: 'in1' },
        { source: 'c', target: 'd', targetHandle: 'in2' },
      ]),
      opts,
    );
    expect(pointOf(p, 'c').y - pointOf(p, 'b').y).toBe(H + 40);
    // the column of two spans 2H+40; the single steps are centred on its middle
    expect(pointOf(p, 'a').y).toBe(pointOf(p, 'b').y + (H + 40) / 2);
    expect(pointOf(p, 'd').y).toBe(pointOf(p, 'a').y);
  });

  it('puts the match output of a Filter above nomatch', () => {
    const p = arrangeLayout(
      def([node('a', 'input_file'), node('f', 'filter'), node('y'), node('x')], [
        { source: 'a', target: 'f' },
        { source: 'f', sourceHandle: 'nomatch', target: 'y' },
        { source: 'f', sourceHandle: 'match', target: 'x' },
      ]),
      opts,
    );
    expect(pointOf(p, 'x').y).toBeLessThan(pointOf(p, 'y').y);
  });

  it('keeps two Filter outputs that join again in order', () => {
    const p = arrangeLayout(
      def([node('a', 'input_file'), node('f', 'filter'), node('n'), node('m'), node('j', 'append')], [
        { source: 'a', target: 'f' },
        { source: 'f', sourceHandle: 'match', target: 'm' },
        { source: 'f', sourceHandle: 'nomatch', target: 'n' },
        { source: 'm', target: 'j', targetHandle: 'in1' },
        { source: 'n', target: 'j', targetHandle: 'in2' },
      ]),
      opts,
    );
    expect(pointOf(p, 'm').y).toBeLessThan(pointOf(p, 'n').y);
    expect(pointOf(p, 'j').x).toBe(3 * (W + 80));
  });

  it('orders a column by the average row of the neighbours, not by the order of the steps', () => {
    const p = arrangeLayout(
      def([node('a', 'input_file'), node('b', 'input_file'), node('y'), node('x')], [
        { source: 'a', target: 'x' },
        { source: 'b', target: 'y' },
      ]),
      opts,
    );
    expect(pointOf(p, 'x').y).toBeLessThan(pointOf(p, 'y').y);
  });

  it('arranges the whole flow when one step is selected', () => {
    const p = arrangeLayout(def([node('a', 'input_file'), node('b')], [{ source: 'a', target: 'b' }]), { ...opts, selection: ['a'] });
    expect(Object.keys(p).sort()).toEqual(['a', 'b']);
  });

  it('stacks flows that are not connected 120 px apart', () => {
    const p = arrangeLayout(def([node('a', 'input_file'), node('b'), node('c', 'input_file')], [{ source: 'a', target: 'b' }]), opts);
    expect(pointOf(p, 'c').y - (pointOf(p, 'a').y + H)).toBe(120);
  });

  it('gives the same result when run twice', () => {
    const d = def([node('a', 'input_file'), node('b'), node('c'), node('d', 'append')], [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'd', targetHandle: 'in1' },
      { source: 'c', target: 'd', targetHandle: 'in2' },
    ]);
    const once = arrangeLayout(d, opts);
    const moved = { ...d, nodes: d.nodes.map((n) => ({ ...n, position: once[n.id] })) };
    expect(arrangeLayout(moved, opts)).toEqual(once);
    expect(arrangeLayout(d, opts)).toEqual(once);
  });

  it('keeps the top left of the box of a selection', () => {
    const d = def([node('a', 'input_file', 300, 200), node('b', 'formula_column', 900, 640), node('z', 'input_file', 0, 0)], [{ source: 'a', target: 'b' }]);
    const p = arrangeLayout(d, { ...opts, selection: ['a', 'b'] });
    expect(Object.keys(p).sort()).toEqual(['a', 'b']);
    expect(Math.min(pointOf(p, 'a').x, pointOf(p, 'b').x)).toBe(300);
    expect(Math.min(pointOf(p, 'a').y, pointOf(p, 'b').y)).toBe(200);
    expect(pointOf(p, 'b').x).toBe(300 + W + 80);
  });

  it('arranges a flow of 60 steps in under 50 ms', () => {
    const nodes: FlowNode[] = [node('n0', 'input_file')];
    const edges: FlowDefinition['edges'] = [];
    for (let i = 1; i < 60; i++) {
      nodes.push(node(`n${i}`));
      edges.push({ source: `n${Math.floor((i - 1) / 2)}`, target: `n${i}` });
    }
    const t = performance.now();
    arrangeLayout(def(nodes, edges), opts);
    expect(performance.now() - t).toBeLessThan(50);
  });
});

describe('alignNodes', () => {
  const rects = [
    { id: 'a', x: 10, y: 100, width: 100, height: 50 },
    { id: 'b', x: 200, y: 20, width: 140, height: 80 },
    { id: 'c', x: 50, y: 300, width: 60, height: 40 },
  ];
  it('aligns left, centre and right', () => {
    expect(alignNodes(rects, 'left')).toEqual({ a: { x: 10, y: 100 }, b: { x: 10, y: 20 }, c: { x: 10, y: 300 } });
    expect(alignNodes(rects, 'right')).toEqual({ a: { x: 240, y: 100 }, b: { x: 200, y: 20 }, c: { x: 280, y: 300 } });
    // the box spans 10 to 340, so its centre is 175
    expect(pointOf(alignNodes(rects, 'center'), 'b').x).toBe(105);
    expect(pointOf(alignNodes(rects, 'center'), 'a').x).toBe(125);
  });
  it('aligns top, middle and bottom', () => {
    expect(alignNodes(rects, 'top')).toEqual({ a: { x: 10, y: 20 }, b: { x: 200, y: 20 }, c: { x: 50, y: 20 } });
    expect(pointOf(alignNodes(rects, 'bottom'), 'c').y).toBe(340 - 40 - 0);
    expect(pointOf(alignNodes(rects, 'middle'), 'a').y).toBe(180 - 25);
  });
});

describe('distributeNodes', () => {
  const rects = [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 120, y: 70, width: 100, height: 50 },
    { id: 'c', x: 400, y: 300, width: 100, height: 50 },
  ];
  it('makes equal gaps horizontally and keeps the outer steps', () => {
    const p = distributeNodes(rects, 'horizontal');
    expect(pointOf(p, 'a').x).toBe(0);
    expect(pointOf(p, 'c').x).toBe(400);
    // gap = (500 - 300) / 2 = 100
    expect(pointOf(p, 'b').x).toBe(200);
    expect(pointOf(p, 'b').y).toBe(70);
  });
  it('makes equal gaps vertically', () => {
    const p = distributeNodes(rects, 'vertical');
    expect(pointOf(p, 'a').y).toBe(0);
    expect(pointOf(p, 'c').y).toBe(300);
    // gap = (350 - 150) / 2 = 100
    expect(pointOf(p, 'b').y).toBe(150);
  });
});
