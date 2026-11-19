import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, ChipGroup, DatePicker, Dialog, Dropdown, ErrorState, Field, InfoTip, ProgressBar, Table, TextAreaField } from '../components';
import type { Column } from '../components';
import { guessTypes, headerNames, listSheets, prepareImport, readGrid, MAX_IMPORT_ROWS } from '../../engine/refimport';
import type { Grid, ImportColumn, ImportProblem } from '../../engine/refimport';
import type { ColumnType } from '../../engine/types';
import type { RefImportResult, RefTableRecord } from '../../store/types';
import { errorText, useT } from '../i18n';
import type { MessageKey } from '../i18n';
import { useStore } from '../store-context';
import { COLUMN_TYPES, applyEdits, draftOf, limitProblems, parseHeaderRow, startFor, stepOfProblem, tablesWithDraft, whyDisabled } from './ref-import-logic';
import type { ImportStep, ImportTargetKind, TargetForm } from './ref-import-logic';
import styles from './ref-import.module.css';

const PREVIEW_ROWS = 20;
/** A header row can be below some title rows; the file is read this far past the data limit so a too large file is seen. */
const READ_ROWS = MAX_IMPORT_ROWS + 1000;

const sizeLabel = (bytes: number): string => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

/** The problems of one step, at most 5, then "and n more". */
function ProblemList({ problems, total, step }: { problems: ImportProblem[]; total: number; step: ImportStep }) {
  const t = useT();
  const own = problems.filter((p) => stepOfProblem(p) === step);
  const box = useRef<HTMLDivElement>(null);
  // The dialog scrolls: a problem that appears below the fold is brought into view.
  const first = own[0]?.messageId ?? '';
  useEffect(() => {
    if (first) box.current?.scrollIntoView?.({ block: 'nearest' });
  }, [first]);
  if (own.length === 0) return null;
  const { shown, more } = limitProblems(own, step === 'columns' ? total : own.length);
  return (
    <div ref={box} className={styles.problems} role="alert">
      <ul>
        {shown.map((p, i) => (
          <li key={i} data-user-content>
            {errorText({ messageId: p.messageId, params: p.params })}
          </li>
        ))}
      </ul>
      {more > 0 ? <span>{t('refTables.import.moreProblems', { n: more })}</span> : null}
    </div>
  );
}

export interface ImportDialogProps {
  tables: RefTableRecord[];
  today: string;
  onClose: () => void;
  onImported: (result: RefImportResult, rows: number) => void;
}

/** Import a file into a reference table (SPEC 12.1 item 1 to 4, DESIGN "Reference table import"). Admin only: the screen offers it to the admin. */
export function ImportDialog({ tables, today, onClose, onImported }: ImportDialogProps) {
  const t = useT();
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const token = useRef(0); // a read that is no longer wanted (another file, Cancel) is ignored when it ends
  const [file, setFile] = useState<(File & { name: string }) | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [headerText, setHeaderText] = useState('1');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [edits, setEdits] = useState<{ names: Record<number, string>; types: Record<number, ColumnType> }>({ names: {}, types: {} });
  const [target, setTarget] = useState<TargetForm>({ kind: 'newTable', name: '', tableId: '', validFrom: '' });
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const draftTables = useMemo(() => tablesWithDraft(tables), [tables]);
  const headerRow = parseHeaderRow(headerText);

  // The columns: names from the header row, types guessed from the first 1,000 filled cells, with the edits on top.
  const guessed = useMemo(() => {
    if (!grid || headerRow === null) return { names: [] as string[], types: [] as ColumnType[] };
    const names = headerNames(grid, headerRow);
    return { names, types: guessTypes(grid, headerRow, names.length) };
  }, [grid, headerRow]);
  const columns: ImportColumn[] = useMemo(() => applyEdits(guessed.names, guessed.types, edits), [guessed, edits]);

  const prepared = useMemo(() => (grid && headerRow !== null ? prepareImport(grid, headerRow, columns) : null), [grid, headerRow, columns]);
  const problems: ImportProblem[] = prepared && !prepared.ok ? prepared.problems : [];
  const problemTotal = prepared && !prepared.ok ? prepared.problemCount : 0;

  const why = whyDisabled({ hasFile: file !== null, reading, headerRow, problems, columns, target, tables });

  const readFile = async (f: File & { name: string }, sheetName?: string): Promise<void> => {
    const mine = ++token.current;
    setReading(true);
    setReadError(null);
    setGrid(null);
    setEdits({ names: {}, types: {} });
    try {
      const list = sheetName === undefined ? await listSheets(f) : sheets;
      const chosen = sheetName ?? list[0] ?? '';
      const g = await readGrid(f, { sheet: chosen || undefined, maxRows: READ_ROWS });
      if (token.current !== mine) return;
      setSheets(list);
      setSheet(chosen);
      setGrid(g);
    } catch (e) {
      if (token.current === mine) setReadError(errorText(e, t('refTables.import.readFailed')));
    } finally {
      if (token.current === mine) setReading(false);
    }
  };

  const chooseTarget = (kind: ImportTargetKind): void => {
    if (kind === 'newTable') setTarget({ kind, name: target.name, tableId: '', validFrom: '' });
    else {
      const list = kind === 'replaceDraft' ? draftTables : tables;
      const first = list.find((x) => x.id === target.tableId) ?? list[0];
      setTarget({ kind, name: target.name, tableId: first?.id ?? '', validFrom: kind === 'newVersion' && first ? startFor(first, today) : '' });
    }
  };
  const chooseTable = (id: string): void => {
    const table = tables.find((x) => x.id === id);
    setTarget({ ...target, tableId: id, validFrom: target.kind === 'newVersion' && table ? startFor(table, today) : target.validFrom });
  };

  const runImport = async (): Promise<void> => {
    if (!prepared || !prepared.ok || why) return;
    setConfirming(false);
    setSaving(true);
    setSaveError(null);
    try {
      const table = tables.find((x) => x.id === target.tableId);
      const result = await store.importRefTable({
        target:
          target.kind === 'newTable'
            ? { kind: 'newTable', name: target.name.trim(), description }
            : target.kind === 'newVersion'
              ? { kind: 'newVersion', tableId: target.tableId, validFrom: target.validFrom }
              : { kind: 'replaceDraft', tableId: target.tableId, versionNo: (table && draftOf(table)?.versionNo) ?? 0 },
        columns: prepared.columns,
        rows: prepared.rows,
      });
      onImported(result, prepared.rows.length);
    } catch (e) {
      setSaveError(errorText(e, t('refTables.import.failed')));
      setSaving(false);
    }
  };

  const dataRows = grid && headerRow !== null ? Math.max(0, grid.rows.length - headerRow) : 0;
  const previewColumns: Column<{ i: number; cells: (string | number | boolean | Date | null)[] }>[] = columns.map((c, ci) => ({
    key: `${ci}`,
    header: c.name || String(ci + 1),
    userContent: true,
    render: (row) => {
      const v = row.cells[ci];
      return <span data-user-content>{v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)}</span>;
    },
  }));
  const previewRows = grid && headerRow !== null ? grid.rows.slice(headerRow, headerRow + PREVIEW_ROWS).map((cells, i) => ({ i, cells })) : [];
  const tableToReplace = tables.find((x) => x.id === target.tableId);
  const typeOptions = COLUMN_TYPES.map((c) => ({ value: c, label: t(`refTables.import.type.${c}` as MessageKey) }));
  const tableOptions = (target.kind === 'replaceDraft' ? draftTables : tables).map((x) => ({ value: x.id, label: x.name }));
  const targetTable = tables.find((x) => x.id === target.tableId);

  return (
    <>
      <Dialog
        title={t('refTables.import.title')}
        width={720}
        onClose={() => {
          token.current++; // Cancel works while the file is read: its result is ignored
          onClose();
        }}
        actions={
          <>
            <Button
              onClick={() => {
                token.current++;
                onClose();
              }}
            >
              {t('refTables.import.cancel')}
            </Button>
            <Button
              variant="primary"
              busy={saving}
              disabled={why !== undefined || saving}
              onClick={() => (target.kind === 'replaceDraft' ? setConfirming(true) : void runImport())}
            >
              {t('refTables.import.run')}
            </Button>
          </>
        }
      >
        <div className={styles.body} tabIndex={0} role="region" aria-label={t('refTables.import.title')} data-dialog-scroll>
          <div className={styles.step}>
            <div className={styles.row}>
              <input
                ref={input}
                type="file"
                hidden
                accept=".xlsx,.csv"
                aria-label={t('refTables.import.fileLabel')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setFile(f);
                  setHeaderText('1');
                  void readFile(f);
                }}
              />
              <Button onClick={() => input.current?.click()}>{file ? t('refTables.import.changeFile') : t('refTables.import.chooseFile')}</Button>
              <span className={styles.fileName} data-user-content={file ? '' : undefined}>
                {file ? t('refTables.import.fileInfo', { name: file.name, size: sizeLabel(file.size) }) : t('refTables.import.noFile')}
              </span>
              <InfoTip label={t('refTables.import.sharedLabel')}>{t('refTables.import.shared')}</InfoTip>
            </div>
            {reading ? (
              <div className={styles.progress}>
                <ProgressBar value={1} max={2} label={t('refTables.import.reading')} />
                <span>{t('refTables.import.reading')}</span>
              </div>
            ) : null}
            {readError ? <ErrorState what={t('refTables.import.readFailed')} next={readError} /> : null}
            <ProblemList problems={problems} total={problemTotal} step="file" />
          </div>

          {grid && file ? (
            <>
              <div className={styles.step}>
                <div className={styles.fields}>
                  {sheets.length > 1 ? (
                    <Dropdown
                      label={t('refTables.import.sheet')}
                      options={sheets.map((s) => ({ value: s, label: s }))}
                      value={sheet}
                      userContent
                      width={220}
                      onChange={(s) => {
                        setSheet(s);
                        void readFile(file, s);
                      }}
                    />
                  ) : null}
                  <div className={styles.headerField}>
                    <Field
                      label={t('refTables.import.headerRow')}
                      value={headerText}
                      inputMode="numeric"
                      autoComplete="off"
                      onChange={(e) => {
                        setHeaderText(e.target.value);
                        setEdits({ names: {}, types: {} });
                      }}
                    />
                  </div>
                </div>
                <ProblemList problems={problems} total={problemTotal} step="header" />
              </div>

              {columns.length > 0 ? (
                <>
                  <div className={styles.step}>
                    <h3 className={styles.stepTitle}>{t('refTables.import.previewTitle')}</h3>
                    <div className={styles.preview} tabIndex={0} role="region" aria-label={t('refTables.import.previewTable')} data-dialog-scroll>
                      <Table label={t('refTables.import.previewTable')} columns={previewColumns} rows={previewRows} rowKey={(r) => String(r.i)} />
                    </div>
                    <span className={styles.note}>{t('refTables.import.previewNote', { rows: dataRows })}</span>
                  </div>

                  <div className={styles.step}>
                    <h3 className={styles.stepTitle}>{t('refTables.import.columnsTitle')}</h3>
                    <ul className={styles.columns} tabIndex={0} aria-label={t('refTables.import.columnsTitle')} data-dialog-scroll>
                      {columns.map((c, i) => (
                        <li key={i} className={styles.columnRow}>
                          <Field label={t('refTables.import.colName', { n: i + 1 })} userLabel={false} value={c.name} onChange={(e) => setEdits({ ...edits, names: { ...edits.names, [i]: e.target.value } })} />
                          <Dropdown
                            label={t('refTables.import.colType', { n: i + 1 })}
                            options={typeOptions}
                            value={c.type}
                            width={160}
                            onChange={(v) => setEdits({ ...edits, types: { ...edits.types, [i]: v as ColumnType } })}
                          />
                        </li>
                      ))}
                    </ul>
                    <ProblemList problems={problems} total={problemTotal} step="columns" />
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          <div className={styles.step}>
            <h3 className={styles.stepTitle}>{t('refTables.import.targetTitle')}</h3>
            <ChipGroup label={t('refTables.import.targetGroup')}>
              <Chip pressed={target.kind === 'newTable'} onClick={() => chooseTarget('newTable')}>
                {t('refTables.import.target.newTable')}
              </Chip>
              {tables.length > 0 ? (
                <Chip pressed={target.kind === 'newVersion'} onClick={() => chooseTarget('newVersion')}>
                  {t('refTables.import.target.newVersion')}
                </Chip>
              ) : null}
              {draftTables.length > 0 ? (
                <Chip pressed={target.kind === 'replaceDraft'} onClick={() => chooseTarget('replaceDraft')}>
                  {t('refTables.import.target.replaceDraft')}
                </Chip>
              ) : null}
            </ChipGroup>
            {target.kind === 'newTable' ? (
              <div className={styles.targetFields}>
                <Field label={t('refTables.tableName')} userLabel={false} value={target.name} onChange={(e) => setTarget({ ...target, name: e.target.value })} />
                <TextAreaField label={t('refTables.tableDescription')} rows={2} userContent value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            ) : (
              <div className={styles.targetFields}>
                <Dropdown label={t('refTables.import.table')} options={tableOptions} value={target.tableId} userContent width={320} onChange={chooseTable} />
                {target.kind === 'newVersion' && targetTable ? <DatePicker label={t('refTables.import.validFrom')} value={target.validFrom} onChange={(d) => setTarget({ ...target, validFrom: d })} width={200} /> : null}
              </div>
            )}
          </div>

        </div>
        <div className={styles.foot}>
          {saving ? (
            <div className={styles.progress}>
              <ProgressBar value={1} max={2} label={t('refTables.import.saving')} />
              <span>{t('refTables.import.saving')}</span>
            </div>
          ) : null}
          {saveError ? <ErrorState what={t('refTables.import.failed')} next={saveError} /> : null}
          {why ? <p className={styles.why}>{t(why)}</p> : null}
        </div>
      </Dialog>
      {confirming && tableToReplace ? (
        <Dialog
          title={t('refTables.import.replaceTitle')}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button onClick={() => setConfirming(false)}>{t('refTables.import.keep')}</Button>
              <Button variant="danger" onClick={() => void runImport()}>
                {t('refTables.import.replace')}
              </Button>
            </>
          }
        >
          <span data-user-content>{t('refTables.import.replaceText', { n: draftOf(tableToReplace)?.versionNo ?? 0, name: tableToReplace.name })}</span>
        </Dialog>
      ) : null}
    </>
  );
}

