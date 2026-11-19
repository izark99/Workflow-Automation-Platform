import type { ImportColumn, ImportProblem } from '../../engine/refimport';
import type { ColumnType } from '../../engine/types';
import type { RefTableRecord, RefTableVersionRecord } from '../../store/types';
import type { MessageKey } from '../i18n';
import { newVersionProblem, suggestStart } from './versions-logic';

export type ImportTargetKind = 'newTable' | 'newVersion' | 'replaceDraft';

/** The step of the dialog that a problem belongs to, so each error is listed under the step that caused it (DESIGN). */
export type ImportStep = 'file' | 'header' | 'columns';

export function stepOfProblem(p: ImportProblem): ImportStep {
  switch (p.messageId) {
    case 'refimport.tooManyRows':
    case 'refimport.tooManyColumns':
      return 'file';
    case 'refimport.noHeader':
    case 'refimport.noColumns':
      return 'header';
    default:
      return 'columns';
  }
}

export const MAX_SHOWN_PROBLEMS = 5;

/** At most 5 problems are shown, then "and {n} more". `total` counts problems that were not kept as well. */
export function limitProblems<T>(items: T[], total: number = items.length): { shown: T[]; more: number } {
  return { shown: items.slice(0, MAX_SHOWN_PROBLEMS), more: Math.max(0, total - MAX_SHOWN_PROBLEMS) };
}

/** The header row: a whole number from 1. */
export function parseHeaderRow(text: string): number | null {
  const clean = text.trim();
  if (!/^[0-9]+$/.test(clean)) return null;
  const n = Number(clean);
  return n >= 1 ? n : null;
}

/** The draft of a table that an import can replace: its highest draft version. */
export function draftOf(table: RefTableRecord): RefTableVersionRecord | undefined {
  return [...table.versions].filter((v) => v.status === 'draft').sort((a, b) => b.versionNo - a.versionNo)[0];
}

export const tablesWithDraft = (tables: RefTableRecord[]): RefTableRecord[] => tables.filter((t) => draftOf(t) !== undefined);

/** The start date that a new version of the table suggests, and why a date cannot be used. */
export const startFor = (table: RefTableRecord, today: string): string => suggestStart(table.versions, today);
export const startProblem = (table: RefTableRecord, date: string): string | undefined => newVersionProblem(table.versions, date);

export interface TargetForm {
  kind: ImportTargetKind;
  name: string;
  tableId: string;
  validFrom: string;
}

/** Why the chosen target cannot be used yet, or undefined. */
export function targetProblem(form: TargetForm, tables: RefTableRecord[]): MessageKey | undefined {
  if (form.kind === 'newTable') {
    const name = form.name.trim();
    if (name === '') return 'refTables.import.why.targetName';
    if (tables.some((t) => t.name.toLowerCase() === name.toLowerCase())) return 'refTables.import.why.targetNameTaken';
    return undefined;
  }
  const table = tables.find((t) => t.id === form.tableId);
  if (!table) return 'refTables.import.why.targetTable';
  if (form.kind === 'replaceDraft') return draftOf(table) ? undefined : 'refTables.import.why.targetNoDraft';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.validFrom) || startProblem(table, form.validFrom)) return 'refTables.import.why.targetDate';
  return undefined;
}

export interface ImportState {
  hasFile: boolean;
  reading: boolean;
  headerRow: number | null;
  /** The problems of the file, of any step. */
  problems: ImportProblem[];
  columns: ImportColumn[];
  target: TargetForm;
  tables: RefTableRecord[];
}

/** The reason Import is off, in the order the dialog is read, or undefined when it can run. */
export function whyDisabled(s: ImportState): MessageKey | undefined {
  if (!s.hasFile) return 'refTables.import.why.noFile';
  if (s.reading) return 'refTables.import.why.reading';
  if (s.headerRow === null) return 'refTables.import.why.header';
  if (s.problems.length > 0) {
    const step = stepOfProblem(s.problems[0]!);
    return step === 'file' ? 'refTables.import.why.file' : step === 'header' ? 'refTables.import.why.header' : 'refTables.import.why.columns';
  }
  if (s.columns.length === 0) return 'refTables.import.why.columns';
  return targetProblem(s.target, s.tables);
}

export const COLUMN_TYPES: readonly ColumnType[] = ['text', 'number', 'date', 'boolean'];

/** The columns of the screen: the guessed names and types, with the edits of the admin on top. */
export function applyEdits(names: string[], types: ColumnType[], edits: { names: Record<number, string>; types: Record<number, ColumnType> }): ImportColumn[] {
  return names.map((name, i) => ({ name: edits.names[i] ?? name, type: edits.types[i] ?? types[i] ?? 'text' }));
}
