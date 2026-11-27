import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeChangeset, NodeChangeset } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePanel } from '../panels/use-panel';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { NODE_TYPES } from '../../engine/flow/types';
import { ErrorState, useDismissToast, useToast } from '../components';
import { translate, useT } from '../i18n';
import { useAppTheme } from '../theme-context';
import { addStep, STEP_CATALOG, CARD_HEIGHT, CARD_WIDTH, arrangeSteps, restorePositions, setPositions, connectSteps, deleteEdges, deleteSteps, inputHandlesOf, moveStep, outputHandlesOf, resolvedEdges, stepNumbers } from './graph';
import { StepCard } from './step-card';
import type { StepCardNode } from './step-card';
import { DRAG_TYPE } from './step-list';
import { FIT_VIEW_OPTIONS } from './fit-view';
import { ZoomControls } from './zoom-controls';
import { inField } from './use-step-clipboard';
import { SelectionToolbar } from './arrange/selection-toolbar';
import { SNAP_GRID, useSnap } from './arrange/snap';
import { addStepAfter, insertStepOnEdge } from './add-after';
import { alignNodes, distributeNodes } from '../../engine/flow/arrange';
import type { AlignMode } from '../../engine/flow/arrange';
import styles from './builder.module.css';

const nodeTypes = { step: StepCard };

export interface Selection {
  nodes: string[];
  edges: string[];
}

export interface CanvasProps {
  definition: FlowDefinition;
  onChange: (next: FlowDefinition) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  message: string | null;
  onMessage: (m: string | null) => void;
  readOnly: boolean;
  /** Asks the canvas to add a step at the next free place (the keyboard path of the step list). */
  addRequest: { type: NodeType; n: number } | null;
}

function Inner({ definition, onChange, selection, onSelect, message, onMessage, readOnly, addRequest }: CanvasProps) {
  // A click on a step card opens a collapsed settings panel.
  const { expand: expandSettings } = usePanel('settings');
  const { screenToFlowPosition, getInternalNode, fitView } = useReactFlow();
  const toast = useToast();
  const [snap, toggleSnap] = useSnap();
  // A step type dragged over an edge: the edge to split and where its middle is on the screen (SPEC 15.2 item 2).
  const [dropEdge, setDropEdge] = useState<{ id: string; x: number; y: number } | null>(null);
  // What a screen reader hears after a step is added by a button.
  const [announcement, setAnnouncement] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const dismissToast = useDismissToast();
  // Positions of the cards that are held. A drag moves the card here and writes the definition once, on the drop (SPEC 13.1).
  const [held, setHeld] = useState<Record<string, { x: number; y: number }>>({});
  // @xyflow/react 13 has no colorMode prop: its stylesheet reads a `light` or `dark` class on an ancestor of .react-flow.
  const { theme } = useAppTheme();
  const t = useT();

  const base: StepCardNode[] = useMemo(() => {
    const numbers = stepNumbers(definition);
    return definition.nodes.map((n, i) => ({
      id: n.id,
      type: 'step' as const,
      position: n.position ?? { x: 0, y: i * (CARD_HEIGHT + 40) },
      // Keep the measured size: a card without one stays hidden until React Flow measures it again (D87).
      measured: getInternalNode(n.id)?.measured,
      selected: selection.nodes.includes(n.id),
      ariaLabel: t('builder.stepAria', { number: numbers.get(n.id) ?? i + 1, name: n.label ?? n.id, type: STEP_CATALOG[n.type].label }),
      data: { step: n, number: numbers.get(n.id) ?? i + 1, inputs: inputHandlesOf(definition, n), outputs: outputHandlesOf(n.type) },
    }));
  }, [definition, selection.nodes, t, getInternalNode]);

  // Cards that are not held keep their object, so that they do not render again for each move of the pointer.
  const nodes: StepCardNode[] = useMemo(() => (Object.keys(held).length === 0 ? base : base.map((n) => (held[n.id] ? { ...n, position: held[n.id]!, dragging: true, measured: getInternalNode(n.id)?.measured ?? n.measured } : n))), [base, held, getInternalNode]);

  const edges: Edge[] = useMemo(
    () => {
      const names = new Map(definition.nodes.map((n) => [n.id, n.label ?? n.id]));
      return resolvedEdges(definition).map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, type: 'smoothstep', selected: selection.edges.includes(e.id), ...(dropEdge?.id === e.id ? { className: 'dropTarget' } : {}), ariaLabel: t('builder.edgeAria', { source: names.get(e.source) ?? e.source, target: names.get(e.target) ?? e.target }) }));
    },
    [definition, selection.edges, t, dropEdge],
  );

  const onNodesChange = (changes: NodeChangeset<StepCardNode>): void => {
    let next = definition;
    const sel = new Set(selection.nodes);
    let selChanged = false;
    let heldNext = held;
    for (const c of changes) {
      if (c.type === 'position' && c.position && !readOnly) {
        // While the pointer holds the card only the canvas moves it; the drop (or a key press) writes the definition.
        if (c.dragging) heldNext = { ...heldNext, [c.id]: c.position };
        else {
          next = moveStep(next, c.id, c.position);
          if (heldNext[c.id]) {
            heldNext = { ...heldNext };
            delete heldNext[c.id];
          }
        }
      } else if (c.type === 'select') {
        selChanged = true;
        if (c.selected) sel.add(c.id);
        else sel.delete(c.id);
      } else if (c.type === 'remove' && !readOnly) {
        next = deleteSteps(next, [c.id]);
        sel.delete(c.id);
        selChanged = true;
      }
    }
    if (heldNext !== held) setHeld(heldNext);
    if (next !== definition) onChange(next);
    if (selChanged) onSelect({ nodes: [...sel], edges: selection.edges });
  };

  const onEdgesChange = (changes: EdgeChangeset<Edge>): void => {
    const sel = new Set(selection.edges);
    let next = definition;
    let selChanged = false;
    for (const c of changes) {
      if (c.type === 'select') {
        selChanged = true;
        if (c.selected) sel.add(c.id);
        else sel.delete(c.id);
      } else if (c.type === 'remove' && !readOnly) {
        next = deleteEdges(next, [c.id]);
        sel.delete(c.id);
        selChanged = true;
      }
    }
    if (next !== definition) onChange(next);
    if (selChanged) onSelect({ nodes: selection.nodes, edges: [...sel] });
  };

  const place = (type: NodeType, position: { x: number; y: number }): void => {
    const r = addStep(definition, type, position);
    onChange(r.definition);
    onSelect({ nodes: [r.id], edges: [] });
    onMessage(null);
  };

  // The keyboard path of the step list: add below the lowest step, once per request.
  const handled = useRef(0);
  const latest = useRef({ definition, place, arrange: (): void => undefined, selection: selection.nodes, addFromList: (() => undefined) as (type: NodeType) => void });

  // Auto arrange (SPEC 15.1): one change, a fitted view, a toast with Undo that goes away with the next change.
  const arranged = useRef<{ toastId: number; after: FlowDefinition } | null>(null);
  const fitPending = useRef(false);
  const arrange = (): void => {
    if (readOnly || definition.nodes.length === 0) return;
    const r = arrangeSteps(definition, selection.nodes);
    fitPending.current = true;
    if (r.unchanged) {
      void fitView({ ...FIT_VIEW_OPTIONS });
      return;
    }
    setHeld({});
    onChange(r.definition);
    const toastId = toast(t('builder.arranged'), {
      durationMs: 8000,
      action: {
        label: t('builder.undo'),
        onAct: () => {
          fitPending.current = true;
          onChange(restorePositions(latest.current.definition, r.previous));
        },
      },
    });
    arranged.current = { toastId, after: r.definition };
  };
  useEffect(() => {
    if (arranged.current && definition !== arranged.current.after) {
      dismissToast(arranged.current.toastId);
      arranged.current = null;
    }
    if (fitPending.current) {
      fitPending.current = false;
      // Wait for the cards to move to their new places; the view then fits at once (no animation).
      requestAnimationFrame(() => void fitView({ ...FIT_VIEW_OPTIONS }));
    }
  }, [definition, dismissToast, fitView]);
  // A step added by its button or key (SPEC 15.2 item 1): after the selected step, connected when it fits.
  const addFromList = (type: NodeType): void => {
    const r = addStepAfter(definition, selection.nodes, type);
    onChange(r.definition);
    onSelect({ nodes: [r.id], edges: [] });
    onMessage(null);
    const added = r.definition.nodes.find((n) => n.id === r.id);
    const name = added?.label ?? r.id;
    setAnnouncement(r.connectedTo ? t('builder.addedConnected', { step: name, from: r.connectedTo.label ?? r.connectedTo.id }) : t('builder.added', { step: name }));
  };
  useEffect(() => {
    latest.current = { definition, place, arrange, selection: selection.nodes, addFromList };
  });
  useEffect(() => {
    if (!addRequest || addRequest.n === handled.current || readOnly) return;
    handled.current = addRequest.n;
    latest.current.addFromList(addRequest.type);
  }, [addRequest, readOnly]);
  // Align and distribute (SPEC 15.1 item 4): the measured size of each card, one change per action.
  const rectsOf = (ids: string[]) =>
    ids.flatMap((id) => {
      const n = definition.nodes.find((x) => x.id === id);
      if (!n) return [];
      const m = getInternalNode(id)?.measured;
      return [{ id, x: n.position?.x ?? 0, y: n.position?.y ?? 0, width: m?.width ?? CARD_WIDTH, height: m?.height ?? CARD_HEIGHT }];
    });
  const align = (mode: AlignMode): void => {
    if (readOnly) return;
    const next = setPositions(definition, alignNodes(rectsOf(selection.nodes), mode));
    if (next !== definition) onChange(next);
  };
  const distribute = (axis: 'horizontal' | 'vertical'): void => {
    if (readOnly) return;
    const next = setPositions(definition, distributeNodes(rectsOf(selection.nodes), axis));
    if (next !== definition) onChange(next);
  };
  // The shortcut Alt+Shift+A never acts while a field, a menu or a dialog has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.altKey && e.shiftKey && e.code === 'KeyA')) return;
      if (inField(e.target)) return;
      e.preventDefault();
      latest.current.arrange();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={frame} className={`${styles.canvas} ${theme}`} onDragOver={(e) => {
      const type = draggedType(e.dataTransfer.types);
      if (type) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
      const hit = !readOnly && type ? edgeUnder(e.clientX, e.clientY, frame.current, (id) => insertStepOnEdge(definition, id, type as NodeType, { x: 0, y: 0 }) !== null) : null;
      setDropEdge((cur) => (cur?.id === hit?.id ? cur : hit));
    }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropEdge(null); }} onDrop={(e) => {
      setDropEdge(null);
      const type = e.dataTransfer.getData(DRAG_TYPE);
      if (readOnly || !(NODE_TYPES as readonly string[]).includes(type)) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const position = { x: p.x - CARD_WIDTH / 2, y: p.y - CARD_HEIGHT / 2 };
      const hit = edgeUnder(e.clientX, e.clientY, frame.current, (id) => insertStepOnEdge(definition, id, type as NodeType, position) !== null);
      const split = hit ? insertStepOnEdge(definition, hit.id, type as NodeType, position) : null;
      if (split) {
        onChange(split.definition);
        onSelect({ nodes: [split.id], edges: [] });
        onMessage(null);
      } else place(type as NodeType, position);
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c) => {
          const r = connectSteps(definition, c);
          if (r.ok) {
            onChange(r.definition);
            onMessage(null);
          } else onMessage(r.reason);
        }}
        onPaneClick={() => onSelect({ nodes: [], edges: [] })}
        onNodeClick={() => expandSettings()}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        edgesReconnectable={false}
        // A selected card must not be raised: the raised edge would then cover the handles of the cards it passes.
        elevateNodesOnSelect={false}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        minZoom={0.2}
        maxZoom={2}
        snapToGrid={snap}
        snapGrid={[SNAP_GRID, SNAP_GRID]}
        fitView={definition.nodes.length > 0}
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={{ hideAttribution: false }}
        aria-label={t('builder.canvas')}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} />
        <ZoomControls summary={summary(definition)} onArrange={arrange} arrangeDisabled={readOnly || definition.nodes.length === 0} snap={snap} onSnap={toggleSnap} />
        {!readOnly && selection.nodes.length >= 2 ? <SelectionToolbar ids={selection.nodes} visible={Object.keys(held).length === 0} onAlign={align} onDistribute={distribute} /> : null}
      </ReactFlow>
      {dropEdge ? (
        <div className={styles.insertPill} style={{ left: dropEdge.x, top: dropEdge.y }} aria-hidden="true">
          {t('builder.insertHere')}
        </div>
      ) : null}
      <div className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </div>
      {message ? (
        <div className={styles.message}>
          <ErrorState what={t('builder.connectFailed')} next={message} />
        </div>
      ) : null}
    </div>
  );
}

/** The step type that is dragged, read from the type names of the drag (its data cannot be read before the drop). */
function draggedType(types: readonly string[]): string | null {
  const prefix = `${DRAG_TYPE}.`;
  const hit = types.find((x) => x.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

/** The edge under the pointer that accepts the dragged step, and the middle of its path in the frame. */
function edgeUnder(x: number, y: number, frame: HTMLElement | null, accepts: (edgeId: string) => boolean): { id: string; x: number; y: number } | null {
  if (!frame) return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const g = el.closest('.react-flow__edge');
    const id = g?.getAttribute('data-id');
    if (!g || !id) continue;
    if (!accepts(id)) return null;
    const path = g.querySelector<SVGPathElement>('.react-flow__edge-path');
    const ctm = path?.getScreenCTM();
    if (!path || !ctm) return null;
    const mid = path.getPointAtLength(path.getTotalLength() / 2);
    const box = frame.getBoundingClientRect();
    return { id, x: ctm.a * mid.x + ctm.c * mid.y + ctm.e - box.left, y: ctm.b * mid.x + ctm.d * mid.y + ctm.f - box.top };
  }
  return null;
}

function summary(def: FlowDefinition): string {
  const steps = def.nodes.length;
  const outputs = def.nodes.filter((n) => n.type === 'output').length;
  return translate('flows.steps', { steps, outputs });
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
