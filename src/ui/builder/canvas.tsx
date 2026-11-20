import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeChangeset, NodeChangeset } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePanel } from '../panels/use-panel';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { NODE_TYPES } from '../../engine/flow/types';
import { ErrorState } from '../components';
import { translate, useT } from '../i18n';
import { useAppTheme } from '../theme-context';
import { addStep, STEP_CATALOG, CARD_HEIGHT, CARD_WIDTH, connectSteps, deleteEdges, deleteSteps, inputHandlesOf, moveStep, nextFreePosition, outputHandlesOf, resolvedEdges, stepNumbers } from './graph';
import { StepCard } from './step-card';
import type { StepCardNode } from './step-card';
import { DRAG_TYPE } from './step-list';
import { FIT_VIEW_OPTIONS } from './fit-view';
import { ZoomControls } from './zoom-controls';
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
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
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
      return resolvedEdges(definition).map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, type: 'smoothstep', selected: selection.edges.includes(e.id), ariaLabel: t('builder.edgeAria', { source: names.get(e.source) ?? e.source, target: names.get(e.target) ?? e.target }) }));
    },
    [definition, selection.edges, t],
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
  const latest = useRef({ definition, place });
  useEffect(() => {
    latest.current = { definition, place };
  });
  useEffect(() => {
    if (!addRequest || addRequest.n === handled.current || readOnly) return;
    handled.current = addRequest.n;
    const { definition: d, place: p } = latest.current;
    p(addRequest.type, nextFreePosition(d));
  }, [addRequest, readOnly]);

  return (
    <div className={`${styles.canvas} ${theme}`} onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={(e) => {
      const type = e.dataTransfer.getData(DRAG_TYPE);
      if (readOnly || !(NODE_TYPES as readonly string[]).includes(type)) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      place(type as NodeType, { x: p.x - CARD_WIDTH / 2, y: p.y - CARD_HEIGHT / 2 });
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
        fitView={definition.nodes.length > 0}
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={{ hideAttribution: false }}
        aria-label={t('builder.canvas')}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} />
        <ZoomControls summary={summary(definition)} />
      </ReactFlow>
      {message ? (
        <div className={styles.message}>
          <ErrorState what={t('builder.connectFailed')} next={message} />
        </div>
      ) : null}
    </div>
  );
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
