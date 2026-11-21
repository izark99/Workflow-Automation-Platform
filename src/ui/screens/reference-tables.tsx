import { useReportUnsaved } from '../session/unsaved';
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Column as TableColumn } from '../components';
import { Badge, Button, Card, Chip, Dialog, Dropdown, EmptyState, ErrorState, Field, Icon, ScreenFrame, SkeletonTable, Table, TextAreaField, useDelayedLoading, useToast } from '../components';
import type { Cell, Column, ColumnType } from '../../engine/types';
import type { RefTableVersionRecord } from '../../store/types';
import { NewVersionDialog, PublishDialog } from '../builder/builder-dialogs';
import { publishSummaryFor, versionOptionLabel } from '../builder/version-logic';
import { useT, errorText } from '../i18n';
import type { MessageKey } from '../i18n';
import { useLoad, useStore } from '../store-context';
import { todayIso } from './flows-logic';
import { columnsProblem, planOf, reshapeGrid, looksLikeGrid, newTableFromPaste, pageRange, pasteAt, pasteIntoGrid, pastedCells, rowsToText, textToRows, tooManyRows, usedByParts, versionToShow, tableSummary } from './reftable-logic';
import type { ColumnPlan, RowErrors } from './reftable-logic';
import { newVersionProblem, suggestStart } from './versions-logic';
import { usePanel } from '../panels/use-panel';
import { PanelToggle } from '../panels/panel-toggle';
import { ImportDialog } from './ref-import-dialog';
import styles from './reference-tables.module.css';

type Dialogs = 'paste' | 'newVersion' | 'publish' | 'newTable' | 'import' | 'columns' | 'description' | null;

/** The shared reference tables: the list, the versions of one table, and its rows (editable while a version is a draft). */
const pastedText = (t: ReturnType<typeof useT>, n: number): string => t('refTables.pasted', { n, nText: n.toLocaleString('en-US') });

export function ReferenceTablesScreen() {
  const t = useT();
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const data = useLoad(async (s) => {
    const me = await s.currentUser();
    return { me, tables: await s.listRefTables() };
  });
  const showSkeleton = useDelayedLoading(data.loading);
  const today = todayIso();

  const isAdmin = data.data?.me.role === 'admin';
  // A user sees the tables that a flow of theirs reads, with their rows; the admin sees every table (SPEC 12.1).
  const tables = (data.data?.tables ?? []).filter((x) => isAdmin || x.usedBy.length > 0);
  const table = tables.find((x) => x.id === params.get('table')) ?? tables[0];
  const version: RefTableVersionRecord | undefined = table ? (table.versions.find((v) => v.versionNo === Number(params.get('v'))) ?? versionToShow(table, today)) : undefined;
  const editable = isAdmin && version?.status === 'draft';

  // The rows being edited, as text. They start from the saved version when a table or version is opened, not after a save.
  const [grid, setGrid] = useState<string[][]>([]);
  // Set by every edit. Comparing a 50,000-row grid with the saved one on each key would be slow, so an edit that is undone still counts.
  const [touched, setTouched] = useState(false);
  const edit = (next: string[][] | ((g: string[][]) => string[][])): void => {
    setGrid(next);
    setTouched(true);
  };
  const [page, setPage] = useState(0);
  const [errors, setErrors] = useState<RowErrors[]>([]);
  const loadedKey = useRef('');
  // The rows that the grid was made from: a version that was loaded again (an import replaced its rows) fills the grid again.
  const loadedRows = useRef<unknown>(null);
  // The columns being edited (a draft only). Null means the columns of the saved version.
  const [colsEdit, setColsEdit] = useState<Column[] | null>(null);
  useEffect(() => {
    if (!table || !version) return;
    const key = `${table.id}:${version.versionNo}`;
    if (loadedKey.current === key && loadedRows.current === version.rows) return;
    loadedKey.current = key;
    loadedRows.current = version.rows;
    setGrid(rowsToText(version.rows, version.columns));
    setColsEdit(null);
    setTouched(false);
    setPage(0);
    setErrors([]);
  }, [table, version]);

  const cols: Column[] = colsEdit ?? version?.columns ?? [];
  const dirty = editable && touched;
  useReportUnsaved(dirty);
  const { collapsed: listCollapsed, toggle: toggleList } = usePanel('refList');

  const [dialog, setDialog] = useState<Dialogs>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'version' | 'table' | null>(null);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const url = (tableId: string, no?: number): string => `/reference-tables?table=${tableId}${no === undefined ? '' : `&v=${no}`}`;
  const go = (to: string): void => {
    if (dirty) setPendingNav(to);
    else void navigate(to);
  };
  const guard = (to: string) => (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    go(to);
  };

  const save = async (): Promise<void> => {
    if (!table || !version) return;
    setSaveError(null);
    const parsed = textToRows(grid, cols);
    setErrors(parsed.errors);
    if (parsed.errors.length > 0) return;
    const tooMany = tooManyRows(parsed.rows.length);
    if (tooMany) {
      setSaveError(tooMany);
      return;
    }
    setBusy('save');
    try {
      await store.saveRefTableVersion(table.id, version.versionNo, colsEdit ? { columns: cols, rows: parsed.rows } : { rows: parsed.rows });
      data.reload();
      loadedKey.current = ''; // reload the text from what was saved (typed numbers come back as numbers)
      toast(t('refTables.saved'));
    } catch (e) {
      setSaveError(errorText(e, t('refTables.saveFailed')));
    } finally {
      setBusy(null);
    }
  };

  const usedByLine = (names: string[]): string => {
    const p = usedByParts(names);
    return p.more > 0 ? t('refTables.usedByMore', { names: p.shown, n: p.more }) : t('refTables.usedBy', { names: p.shown });
  };

  const firstError = (row: number, col: string): boolean => errors.some((e) => e.row === row && e.column === col);
  const range = pageRange(grid.length, page);
  const pageRows = grid.slice(range.from, range.to).map((cells, i) => ({ index: range.from + i, cells }));
  const columns: TableColumn<{ index: number; cells: string[] }>[] = version
    ? [
        ...cols.map((c, ci) => ({
          key: `${ci}-${c.name}`,
          header: c.name,
          userContent: true,
          align: c.type === 'number' ? ('right' as const) : ('left' as const),
          render: (row: { index: number; cells: string[] }) =>
            editable ? (
              <input
                type="text"
                className={styles.cellInput}
                aria-label={t('refTables.cell', { row: row.index + 1, column: c.name })}
                aria-invalid={firstError(row.index + 1, c.name) ? 'true' : undefined}
                data-row={row.index}
                data-col={ci}
                value={row.cells[ci] ?? ''}
                onChange={(e) => edit((g) => g.map((r, ri) => (ri === row.index ? r.map((x, xi) => (xi === ci ? e.target.value : x)) : r)))}
              />
            ) : (
              (row.cells[ci] ?? '')
            ),
        })),
        ...(editable
          ? [{ key: 'remove', header: '', render: (row: { index: number; cells: string[] }) => (
              <Button size="sm" aria-label={t('refTables.removeRow', { n: row.index + 1 })} onClick={() => edit((g) => g.filter((_, i) => i !== row.index))}>
                <Icon name="x" />
              </Button>
            ) }]
          : []),
      ]
    : [];

  const onPaste = (e: ClipboardEvent<HTMLDivElement>): void => {
    const text = e.clipboardData.getData('text/plain');
    const target = e.target as HTMLElement;
    if (!editable || !version || !looksLikeGrid(text) || target.dataset.row === undefined) return; // a single value pastes into its own cell
    e.preventDefault();
    const next = pasteAt(grid, cols.length, Number(target.dataset.row), Number(target.dataset.col), pastedCells(text));
    edit(next);
    setInfo(pastedText(t, pastedCells(text).length));
  };

  const createTable = async (name: string, description: string, text: string): Promise<void> => {
    const parsed = newTableFromPaste(text);
    if (!parsed.ok) {
      setDialogError(parsed.message);
      return;
    }
    const tooMany = tooManyRows(parsed.rows.length);
    if (tooMany) {
      setDialogError(tooMany);
      return;
    }
    setBusy('table');
    setDialogError(null);
    try {
      const created = await store.createRefTable({ name, description, columns: parsed.columns });
      await store.saveRefTableVersion(created.id, 1, { rows: parsed.rows });
      setDialog(null);
      loadedKey.current = '';
      data.reload();
      void navigate(url(created.id, 1));
    } catch (e) {
      setDialogError(errorText(e, t('refTables.createFailed')));
    } finally {
      setBusy(null);
    }
  };

  const mutateVersion = async (kind: 'newVersion' | 'publish', validFrom?: string): Promise<void> => {
    if (!table || !version) return;
    setBusy(kind === 'publish' ? 'publish' : 'version');
    setDialogError(null);
    try {
      if (kind === 'publish') {
        await store.publishRefTableVersion(table.id, version.versionNo);
        toast(t('refTables.published', { n: version.versionNo }));
        setDialog(null);
      } else {
        const updated = await store.createRefTableVersion(table.id, { validFrom: validFrom as string, copyFrom: version.versionNo });
        const no = Math.max(...updated.versions.map((v) => v.versionNo));
        toast(t('refTables.created', { n: no }));
        setDialog(null);
        loadedKey.current = '';
        void navigate(url(table.id, no));
      }
      data.reload();
    } catch (e) {
      setDialogError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (data.error) {
    body = <ErrorState what={t('refTables.loadFailed')} next={t('refTables.loadFailedNext')} actions={<Button size="sm" onClick={data.reload}>{t('flows.retry')}</Button>} />;
  } else if (data.loading && !data.data) {
    body = showSkeleton ? <SkeletonTable dense weights={[10, 16, 12, 12, 14]} rows={3} label={t('refTables.loading')} /> : null;
  } else if (tables.length === 0 || !table || !version) {
    body = <EmptyState title={t('refTables.emptyTitle')} text={isAdmin ? t('refTables.emptyText') : t('refTables.emptyReader')} action={isAdmin ? <Button onClick={() => { setDialogError(null); setDialog('newTable'); }}>{t('refTables.newTable')}</Button> : null} />;
  } else {
    const sorted = [...table.versions].sort((a, b) => b.versionNo - a.versionNo);
    body = (
      <div className={styles.layout}>
        <div id="ref-list-panel" className={`${styles.listPanel} ${listCollapsed ? styles.listRail : ''}`}>
        <div className={styles.listToggle}>
          <PanelToggle panel="refList" collapsed={listCollapsed} onToggle={toggleList} controls="ref-list-panel" />
        </div>
        <ul className={styles.list} aria-label={t('refTables.list')} hidden={listCollapsed}>
          {tables.map((x) => (
            <li key={x.id}>
              <Link to={url(x.id)} className={styles.item} aria-current={x.id === table.id ? 'true' : undefined} onClick={guard(url(x.id))}>
                <span data-user-content>{x.name}</span>
                <span className={styles.itemSub}>{tableSummary(x, today)}</span>
                {!isAdmin ? (
                  <span className={`${styles.itemSub} ${styles.itemClip}`} title={usedByLine(x.usedBy)} data-user-content>
                    {usedByLine(x.usedBy)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        </div>
        <section className={styles.detail} aria-label={t('refTables.detail')}>
          <Card flush title={t('refTables.grid', { name: table.name })}>
            <div className={styles.head}>
              <div className={styles.headText}>
                <h2 data-user-content>{table.name}</h2>
                {table.description ? <span className={styles.note} data-user-content>{table.description}</span> : null}
              </div>
              <div className={styles.headActions}>
                {dirty ? (
                  <span className={styles.dirty} role="status">
                    {t('refTables.unsaved')}
                  </span>
                ) : null}
                {/* A draft shows what the admin does most: save, then publish. The rest is in the menu. */}
                {editable ? (
                  <>
                    <Button busy={busy === 'save'} disabled={!dirty} onClick={() => void save()}>
                      {busy === 'save' ? t('refTables.saving') : t('refTables.save')}
                    </Button>
                    <Button disabled={dirty} onClick={() => { setDialogError(null); setDialog('publish'); }}>
                      {t('refTables.publish')}
                    </Button>
                  </>
                ) : null}
                {/* A published version is read-only: the one thing to do with it is a new version. */}
                {isAdmin && !editable ? <Button onClick={() => { setDialogError(null); setDialog('newVersion'); }}>{t('refTables.newVersion')}</Button> : null}
                {isAdmin ? (
                  <Dropdown
                    width={112}
                    label={t('refTables.menu.label')}
                    buttonLabel={t('admin.menu.more')}
                    options={[
                      { value: 'description', label: t('refTables.desc.button') },
                      ...(editable
                        ? [
                            { value: 'columns', label: t('refTables.cols.button') },
                            { value: 'paste', label: t('refTables.paste') },
                            { value: 'newVersion', label: t('refTables.newVersion') },
                          ]
                        : []),
                    ]}
                    value=""
                    onChange={(v) => {
                      setDialogError(null);
                      if (v === 'paste') setPasteText('');
                      setDialog(v as Dialogs);
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div className={styles.chips} role="group" aria-label={t('refTables.versionsLabel')}>
              {sorted.map((v) => (
                <Chip key={v.versionNo} pressed={v.versionNo === version.versionNo} onClick={() => go(url(table.id, v.versionNo))}>
                  {versionOptionLabel(v)}
                </Chip>
              ))}
              <Badge tone={version.status === 'draft' ? 'outline' : 'soft'}>{version.status === 'draft' ? t('refTables.badge.draft') : t('refTables.badge.published')}</Badge>
            </div>
            {dirty && editable ? <p className={styles.note} style={{ padding: '0 20px 12px' }}>{t('refTables.publishNeedsSave')}</p> : null}
            {info ? (
              <p className={styles.note} style={{ padding: '0 20px 12px' }} role="status">
                {info}
              </p>
            ) : null}
            {errors.length > 0 ? (
              <div style={{ padding: '0 20px 12px' }}>
                <ErrorState what={t('refTables.rowErrors', { n: errors.length })} next={t('refTables.cellError', { row: errors[0]!.row, column: errors[0]!.column, message: errors[0]!.message })} />
              </div>
            ) : null}
            {saveError ? (
              <div style={{ padding: '0 20px 12px' }}>
                <ErrorState what={t('refTables.saveFailed')} next={saveError} />
              </div>
            ) : null}
            <div className={styles.gridWrap} onPaste={onPaste}>
              {grid.length === 0 ? <p className={styles.note} style={{ padding: 20 }}>{t('refTables.noRows')}</p> : <Table dense label={t('refTables.grid', { name: table.name })} columns={columns} rows={pageRows} rowKey={(r) => String(r.index)} />}
            </div>
            {editable || range.pages > 1 ? (
              <div className={styles.pager}>
                {editable ? (
                  <Button size="sm" onClick={() => { edit((g) => [...g, cols.map(() => '')]); setPage(pageRange(grid.length + 1, 999).page); }}>
                    {t('refTables.addRow')}
                  </Button>
                ) : null}
                {grid.length > 0 ? <span className={styles.note}>{t('refTables.showing', { from: (range.from + 1).toLocaleString('en-US'), to: range.to.toLocaleString('en-US'), total: grid.length.toLocaleString('en-US') })}</span> : null}
                {range.pages > 1 ? (
                  <>
                    <Button size="sm" disabled={range.page === 0} onClick={() => setPage(range.page - 1)}>
                      {t('refTables.previous')}
                    </Button>
                    <Button size="sm" disabled={range.page >= range.pages - 1} onClick={() => setPage(range.page + 1)}>
                      {t('refTables.next')}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className={styles.notes}>
              {!isAdmin ? <p className={styles.note}>{t('refTables.readOnlyUser')}</p> : version.status === 'published' ? <p className={styles.note}>{t('refTables.readOnlyPublished')}</p> : null}
              <p className={styles.note} data-user-content={table.usedBy.length > 0 ? '' : undefined}>{table.usedBy.length > 0 ? usedByLine(table.usedBy) : t('refTables.notUsed')}</p>
            </div>
          </Card>
        </section>
        {dialog === 'paste' ? (
          <Dialog
            title={t('refTables.pasteTitle')}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t('refTables.cancel')}</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const r = pasteIntoGrid(pasteText, cols);
                    if (!r.ok) {
                      setDialogError(r.message);
                      return;
                    }
                    edit(r.rows);
                    setPage(0);
                    setInfo(pastedText(t, r.rows.length));
                    setDialog(null);
                  }}
                >
                  {t('refTables.pasteApply')}
                </Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <TextAreaField label={t('refTables.pasteLabel')} hint={t('refTables.pasteHelp')} mono rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} error={dialogError ?? undefined} />
            </div>
          </Dialog>
        ) : null}
        {dialog === 'newVersion' ? (
          <NewVersionDialog fromNo={version.versionNo} suggested={suggestStart(table.versions, today)} check={(d) => newVersionProblem(table.versions, d)} busy={busy === 'version'} error={dialogError} onCreate={(d) => void mutateVersion('newVersion', d)} onCancel={() => setDialog(null)} />
        ) : null}
        {dialog === 'publish' ? (
          <PublishDialog versionNo={version.versionNo} text={publishSummaryFor(table.versions, version.versionNo, `reference table "${table.name}"`).text} dirty={false} busy={busy === 'publish'} error={dialogError} onConfirm={() => void mutateVersion('publish')} onCancel={() => setDialog(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <ScreenFrame
        breadcrumb={<span>{t('refTables.screen.crumb')}</span>}
        title={t('refTables.screen.title')}
        subtitle={t('refTables.screen.subtitle')}
        action={
          isAdmin ? (
            <div className={styles.headerActions}>
              <Button onClick={() => setDialog('import')}>{t('refTables.importFile')}</Button>
              <Button onClick={() => { setDialogError(null); setDialog('newTable'); }}>{t('refTables.newTable')}</Button>
            </div>
          ) : undefined
        }
      >
        {body}
      </ScreenFrame>
      {dialog === 'columns' && editable ? (
        <ColumnsDialog
          initial={cols}
          onCancel={() => setDialog(null)}
          onApply={(plan) => {
            const shaped = reshapeGrid(grid, plan);
            setColsEdit(shaped.columns);
            edit(shaped.grid);
            setErrors([]);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'description' && table ? (
        <DescriptionDialog
          initial={table.description}
          busy={busy === 'table'}
          error={dialogError}
          onCancel={() => setDialog(null)}
          onSave={(description) => {
            setBusy('table');
            setDialogError(null);
            store.updateRefTable(table.id, { description }).then(
              () => {
                setDialog(null);
                setBusy(null);
                toast(t('refTables.desc.saved'));
                data.reload();
              },
              (e: unknown) => {
                setDialogError(errorText(e, t('refTables.desc.failed')));
                setBusy(null);
              },
            );
          }}
        />
      ) : null}
      {dialog === 'import' ? (
        <ImportDialog
          tables={tables}
          today={today}
          onClose={() => setDialog(null)}
          onImported={(result, rows) => {
            setDialog(null);
            loadedKey.current = '';
            data.reload();
            toast(t('refTables.import.done', { rows }));
            void navigate(url(result.table.id, result.versionNo));
          }}
        />
      ) : null}
      {dialog === 'newTable' ? <NewTableDialog busy={busy === 'table'} error={dialogError} onCreate={(n, d, x) => void createTable(n, d, x)} onCancel={() => setDialog(null)} /> : null}
      {pendingNav ? (
        <Dialog
          title={t('refTables.discardTitle')}
          onClose={() => setPendingNav(null)}
          actions={
            <>
              <Button onClick={() => setPendingNav(null)}>{t('refTables.stay')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const to = pendingNav;
                  setPendingNav(null);
                  loadedKey.current = '';
                  void navigate(to);
                }}
              >
                {t('refTables.discard')}
              </Button>
            </>
          }
        >
          {t('refTables.discardText')}
        </Dialog>
      ) : null}
    </>
  );
}

const typeLabel = (t: ReturnType<typeof useT>, type: ColumnType): string => t(`refTables.import.type.${type}` as MessageKey);

/** The columns of a draft: add, rename, change the type of and remove. Applying changes the grid; Save stores it. */
function ColumnsDialog({ initial, onApply, onCancel }: { initial: Column[]; onApply: (plan: ColumnPlan[]) => void; onCancel: () => void }) {
  const t = useT();
  const [plan, setPlan] = useState<ColumnPlan[]>(() => planOf(initial));
  const problem = columnsProblem(plan);
  const set = (i: number, patch: Partial<ColumnPlan>): void => setPlan((p) => p.map((c, ci) => (ci === i ? { ...c, ...patch } : c)));
  return (
    <Dialog
      title={t('refTables.cols.title')}
      width={640}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('refTables.cancel')}</Button>
          <Button variant="primary" disabled={problem !== undefined} onClick={() => onApply(plan)}>
            {t('refTables.cols.apply')}
          </Button>
        </>
      }
    >
      <div className={styles.colsBody}>
        <ul className={styles.colsList} tabIndex={0} aria-label={t('refTables.cols.title')} data-dialog-scroll>
          {plan.map((c, i) => (
            <li key={i} className={styles.colsRow}>
              <div className={styles.colsName}>
                <Field label={t('refTables.cols.name', { n: i + 1 })} userLabel={false} value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
              </div>
              <Dropdown
                label={t('refTables.cols.type', { n: i + 1 })}
                options={(['text', 'number', 'date', 'boolean'] as const).map((x) => ({ value: x, label: typeLabel(t, x) }))}
                value={c.type}
                width={150}
                onChange={(v) => set(i, { type: v as ColumnType })}
              />
              <Button aria-label={t('refTables.cols.remove', { n: i + 1 })} onClick={() => setPlan((p) => p.filter((_, ci) => ci !== i))}>
                <Icon name="x" />
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button onClick={() => setPlan((p) => [...p, { from: null, name: '', type: 'text' }])}>{t('refTables.cols.add')}</Button>
        </div>
        {problem ? <ErrorState what={t('refTables.cols.problemTitle')} next={t(problem.key, problem.params)} /> : null}
      </div>
    </Dialog>
  );
}

function DescriptionDialog({ initial, busy, error, onSave, onCancel }: { initial: string; busy: boolean; error: string | null; onSave: (description: string) => void; onCancel: () => void }) {
  const t = useT();
  const [text, setText] = useState(initial);
  return (
    <Dialog
      title={t('refTables.desc.title')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('refTables.cancel')}</Button>
          <Button variant="primary" busy={busy} onClick={() => onSave(text)}>
            {t('refTables.desc.save')}
          </Button>
        </>
      }
    >
      <div className={styles.colsBody}>
        <TextAreaField label={t('refTables.tableDescription')} rows={3} userContent value={text} onChange={(e) => setText(e.target.value)} />
        {error ? <ErrorState what={t('refTables.desc.failed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

function NewTableDialog({ busy, error, onCreate, onCancel }: { busy: boolean; error: string | null; onCreate: (name: string, description: string, text: string) => void; onCancel: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={t('refTables.newTitle')}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t('refTables.cancel')}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              if (!name.trim()) setLocal(t('common.pair', { a: t('refTables.emptyName'), b: t('refTables.emptyNameNext') }));
              else {
                setLocal(null);
                onCreate(name, description, text);
              }
            }}
          >
            {t('refTables.create')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t('refTables.tableName')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('refTables.tableDescription')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextAreaField label={t('refTables.tablePaste')} hint={t('refTables.tablePasteHelp')} mono rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        {local ? <ErrorState what={t('refTables.createFailed')} next={local} /> : null}
        {error ? <ErrorState what={t('refTables.createFailed')} next={error} /> : null}
      </div>
    </Dialog>
  );
}

export type { Cell };
