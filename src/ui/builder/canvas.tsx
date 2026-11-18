import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeChangeset, NodeChangeset } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef } from 'react';
import type { FlowDefinition, NodeType } from '../../engine/flow/types';
import { NODE_TYPES } from '../../engine/flow/types';
import { ErrorState } from '../components';
import { strings } from '../strings';
import { addStep, STEP_CATALOG, CARD_HEIGHT, CARD_WIDTH, connectSteps, deleteEdges, deleteSteps, inputHandlesOf, moveStep, nextFreePosition, outputHandlesOf, resolvedEdges, stepNumbers } from './graph';
import { StepCard } from './step-card';
import type { StepCardNode } from './step-card';
import { DRAG_TYPE } from './step-list';
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
  const { screenToFlowPosition } = useReactFlow();

  const nodes: StepCardNode[] = useMemo(() => {
    const numbers = stepNumbers(definition);
    return definition.nodes.map((n, i) => ({
      id: n.id,
      type: 'step' as const,
      position: n.position ?? { x: 0, y: i * (CARD_HEIGHT + 40) },
      selected: selection.nodes.includes(n.id),
      ariaLabel: `Step ${numbers.get(n.id) ?? i + 1}: ${n.label ?? n.id}, ${STEP_CATALOG[n.type].label}`,
      data: { step: n, number: numbers.get(n.id) ?? i + 1, inputs: inputHandlesOf(definition, n), outputs: outputHandlesOf(n.type) },
    }));
  }, [definition, selection.nodes]);

  const edges: Edge[] = useMemo(
    () => resolvedEdges(definition).map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, type: 'smoothstep', selected: selection.edges.includes(e.id) })),
    [definition, selection.edges],
  );

  const onNodesChange = (changes: NodeChangeset<StepCardNode>): void => {
    let next = definition;
    const sel = new Set(selection.nodes);
    let selChanged = false;
    for (const c of changes) {
      if (c.type === 'position' && c.position && !readOnly) next = moveStep(next, c.id, c.position);
      else if (c.type === 'select') {
        selChanged = true;
        if (c.selected) sel.add(c.id);
        else sel.delete(c.id);
      } else if (c.type === 'remove' && !readOnly) {
        next = deleteSteps(next, [c.id]);
        sel.delete(c.id);
        selChanged = true;
      }
    }
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
    <div className={styles.canvas} onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={(e) => {
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
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        edgesReconnectable={false}
        // A selected card must not be raised: the raised edge would then cover the handles of the cards it passes.
        elevateNodesOnSelect={false}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        minZoom={0.2}
        maxZoom={2}
        fitView={definition.nodes.length > 0}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: false }}
        aria-label={strings.builder.canvas}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} />
        <ZoomControls summary={summary(definition)} />
      </ReactFlow>
      {message ? (
        <div className={styles.message}>
          <ErrorState what={strings.builder.connectFailed} next={message} />
        </div>
      ) : null}
    </div>
  );
}

function summary(def: FlowDefinition): string {
  const steps = def.nodes.length;
  const outputs = def.nodes.filter((n) => n.type === 'output').length;
  return `${steps} ${steps === 1 ? 'step' : 'steps'}, ${outputs} output ${outputs === 1 ? 'sheet' : 'sheets'}`;
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
