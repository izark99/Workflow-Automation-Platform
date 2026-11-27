import { useEffect, useRef } from 'react';
import type { FlowDefinition } from '../../engine/flow/types';
import { copySteps, getClip, nextPasteOffset, notePasted, pasteSteps, setClip } from './clipboard';

/** True when the key press belongs to a field, a dialog or a menu: the step shortcuts never act there. */
export function inField(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], [role="combobox"], [role="textbox"]');
}

export interface StepClipboardOptions {
  definition: FlowDefinition;
  /** Ids of the selected steps. */
  selected: string[];
  readOnly: boolean;
  onChange: (next: FlowDefinition) => void;
  onSelect: (ids: string[]) => void;
  /** Called with the text of the confirmation of an action. */
  onDone: (kind: 'pasted' | 'copied', count: number) => void;
}

export interface StepClipboard {
  duplicate: () => void;
  copy: () => void;
  paste: () => void;
}

function duplicateSteps(o: StepClipboardOptions): void {
  if (o.readOnly) return;
  const clip = copySteps(o.definition, o.selected);
  if (!clip) return;
  const r = pasteSteps(o.definition, clip);
  o.onChange(r.definition);
  o.onSelect(r.ids);
  o.onDone('pasted', r.ids.length);
}

function copySelected(o: StepClipboardOptions): void {
  const clip = copySteps(o.definition, o.selected);
  if (!clip) return;
  setClip(clip);
  o.onDone('copied', clip.nodes.length);
}

function pasteClip(o: StepClipboardOptions): void {
  const clip = getClip();
  if (o.readOnly || !clip) return;
  const r = pasteSteps(o.definition, clip, nextPasteOffset());
  notePasted();
  o.onChange(r.definition);
  o.onSelect(r.ids);
  o.onDone('pasted', r.ids.length);
}

/**
 * Ctrl+D, Ctrl+C and Ctrl+V (Cmd on a Mac) on the selected steps, and the same actions for buttons. Each paste or duplicate is one
 * change of the definition. Nothing is written to the system clipboard.
 */
export function useStepClipboard(options: StepClipboardOptions): StepClipboard {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.defaultPrevented || inField(e.target)) return;
      if (e.code !== 'KeyD' && e.code !== 'KeyC' && e.code !== 'KeyV') return;
      // Text that the user selected on the page is copied as text, not as steps.
      if (e.code === 'KeyC' && (window.getSelection()?.toString() ?? '') !== '') return;
      e.preventDefault();
      if (e.code === 'KeyD') duplicateSteps(latest.current);
      else if (e.code === 'KeyC') copySelected(latest.current);
      else pasteClip(latest.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return {
    duplicate: () => duplicateSteps(latest.current),
    copy: () => copySelected(latest.current),
    paste: () => pasteClip(latest.current),
  };
}
