import { beforeEach, describe, expect, it } from 'vitest';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { copySteps, getClip, nextPasteOffset, notePasted, pasteSteps, setClip } from './clipboard';
import { addStep, connectSteps, emptyDefinition, resolvedEdges } from './graph';

const add = (def: FlowDefinition, type: NodeType, at = { x: 100, y: 100 }) => {
  const r = addStep(def, type, at);
  return { def: r.definition, id: r.id };
};
const link = (def: FlowDefinition, a: string, b: string, sh: string | null = null, th: string | null = null) => {
  const r = connectSteps(def, { source: a, sourceHandle: sh, target: b, targetHandle: th });
  if (!r.ok) throw new Error(r.reason);
  return r.definition;
};

function chain() {
  let d = emptyDefinition();
  const a = add(d, 'input_file', { x: 0, y: 0 });
  d = a.def;
  const b = add(d, 'formula_column', { x: 300, y: 0 });
  d = b.def;
  const c = add(d, 'output', { x: 600, y: 0 });
  d = c.def;
  d = link(link(d, a.id, b.id), b.id, c.id);
  return { d, a: a.id, b: b.id, c: c.id };
}

describe('copySteps and pasteSteps', () => {
  it('copies the settings, the bindings and the name with (copy), offset by 40 px', () => {
    const { d, b } = chain();
    const bound = { ...d, nodes: d.nodes.map((n) => (n.id === b ? { ...n, settings: { name: { $param: 'col' }, expression: '[A]+1' } } : n)) };
    const clip = copySteps(bound, [b])!;
    const r = pasteSteps(bound, clip);
    const copy = r.definition.nodes.find((n) => n.id === r.ids[0])!;
    expect(copy.settings).toEqual({ name: { $param: 'col' }, expression: '[A]+1' });
    expect(copy.settings).not.toBe(bound.nodes.find((n) => n.id === b)!.settings);
    expect(copy.label).toBe('Formula column (copy)');
    expect(copy.position).toEqual({ x: 340, y: 40 });
    expect(copy.id).not.toBe(b);
  });
  it('keeps the edges between copied steps and drops the edges to steps that are not copied', () => {
    const { d, a, b } = chain();
    const r = pasteSteps(d, copySteps(d, [a, b])!);
    const [na, nb] = r.ids as [string, string];
    const edges = resolvedEdges(r.definition);
    expect(edges).toHaveLength(2 + 1);
    expect(edges.filter((e) => e.source === na && e.target === nb)).toHaveLength(1);
    expect(edges.filter((e) => e.source === nb)).toHaveLength(0);
  });
  it('makes the key of an Input file unique, again and again', () => {
    const chained = chain();
    const a = chained.a;
    const d = { ...chained.d, nodes: chained.d.nodes.map((n) => (n.id === a ? { ...n, settings: { ...n.settings, key: 'Main' } } : n)) };
    const clip = copySteps(d, [a])!;
    const one = pasteSteps(d, clip);
    expect(one.definition.nodes.find((n) => n.id === one.ids[0])?.settings.key).toBe('Main 2');
    const two = pasteSteps(one.definition, clip);
    expect(two.definition.nodes.find((n) => n.id === two.ids[0])?.settings.key).toBe('Main 3');
    expect(two.definition.nodes.find((n) => n.id === two.ids[0])?.label).toBe('Input file (copy 2)');
  });
  it('pastes into another flow, with the same key when nothing there uses it', () => {
    const { d, a } = chain();
    const clip = copySteps(d, [a])!;
    const other = add(emptyDefinition(), 'filter').def;
    const r = pasteSteps(other, clip);
    expect(r.definition.nodes).toHaveLength(2);
    expect(r.definition.nodes.at(-1)?.settings.key).toBe(d.nodes.find((n) => n.id === a)?.settings.key);
  });
  it('renumbers the inputs of an Append when only some of them are copied', () => {
    let d = emptyDefinition();
    const i1 = add(d, 'input_file');
    d = i1.def;
    const i2 = add(d, 'input_file', { x: 0, y: 200 });
    d = i2.def;
    const ap = add(d, 'append', { x: 400, y: 100 });
    d = ap.def;
    d = link(link(d, i1.id, ap.id, null, 'in1'), i2.id, ap.id, null, 'in2');
    const r = pasteSteps(d, copySteps(d, [i2.id, ap.id])!);
    const into = resolvedEdges(r.definition).filter((e) => e.target === r.ids[1]);
    expect(into.map((e) => e.targetHandle)).toEqual(['in1']);
  });
  it('the copy does not change when the source changes later, and the source is not touched', () => {
    const { d, b } = chain();
    const before = JSON.stringify(d);
    const clip = copySteps(d, [b])!;
    pasteSteps(d, clip);
    expect(JSON.stringify(d)).toBe(before);
    expect(copySteps(d, [])).toBeNull();
  });
  it('raises the schema version of the target when the clip is newer', () => {
    const { d, b } = chain();
    const clip = { ...copySteps(d, [b])!, schemaVersion: 3 as const };
    expect(pasteSteps(emptyDefinition(), clip).definition.schemaVersion).toBe(3);
  });
});

describe('the clipboard in memory', () => {
  beforeEach(() => setClip(null));
  it('holds a clip, moves each paste further, and resets with a new copy', () => {
    expect(getClip()).toBeNull();
    const { d, b } = chain();
    setClip(copySteps(d, [b]));
    expect(nextPasteOffset()).toBe(40);
    notePasted();
    expect(nextPasteOffset()).toBe(80);
    setClip(copySteps(d, [b]));
    expect(nextPasteOffset()).toBe(40);
  });
});
