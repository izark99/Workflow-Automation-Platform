import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Column as TableColumn } from '../components';
import { Badge, Button, Card, Chip, Dialog, EmptyState, ErrorState, Field, Icon, ScreenFrame, SkeletonTable, Table, TextAreaField, useDelayedLoading, useToast } from '../components';
import type { Cell } from '../../engine/types';
import type { RefTableRecord, RefTableVersionRecord } from '../../store/types';
import { NewVersionDialog, PublishDialog } from '../builder/builder-dialogs';
import { publishSummaryFor, versionOptionLabel } from '../builder/version-logic';
import { translate } from '../i18n';
import { useLoad, useStore } from '../store-context';
import { refStrings as t, strings } from '../strings';
import { todayIso } from './flows-logic';
import { looksLikeGrid, newTableFromPaste, pageRange, pasteAt, pasteIntoGrid, pastedCells, rowsToText, textToRows, tooManyRows, usedBy, versionToShow, tableSummary } from './reftable-logic';
import type { RowErrors } from './reftable-logic';
import { newVersionProblem, suggestStart } from './versions-logic';
import styles from './reference-tables.module.css';

type Dialogs = 'paste' | 'newVersion' | 'publish' | 'newTable' | null;

/** The shared reference tables: the list, the versions of one table, and its rows (editable while a version is a draft). */
export function ReferenceTablesScreen() {
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const data = useLoad(async (s) => {
    const me = await s.currentUser();
    return { me, tables: await s.listRefTables(), flows: await s.listFlows() };
  });
  const showSkeleton = useDelayedLoading(data.loading);
  const today = todayIso();

  const tables = data.data?.tables ?? [];
  const isAdmin = data.data?.me.role === 'admin';
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
  useEffect(() => {
    if (!table || !version) return;
    const key = `${table.id}:${version.versionNo}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setGrid(rowsToText(version.rows, version.columns));
    setTouched(false);
    setPage(0);
    setErrors([]);
  }, [table, version]);

  const dirty = editable && touched;

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
    const parsed = textToRows(grid, version.columns);
    setErrors(parsed.errors);
    if (parsed.errors.length > 0) return;
    const tooMany = tooManyRows(parsed.rows.length);
    if (tooMany) {
      setSaveError(tooMany);
      return;
    }
    setBusy('save');
    try {
      await store.saveRefTableVersion(table.id, version.versionNo, { rows: parsed.rows });
      data.reload();
      loadedKey.current = ''; // reload the text from what was saved (typed numbers come back as numbers)
      toast(t.saved);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const usedByNames = table ? usedBy(data.data?.flows ?? [], table.name) : [];

  const firstError = (row: number, col: string): boolean => errors.some((e) => e.row === row && e.column === col);
  const range = pageRange(grid.length, page);
  const pageRows = grid.slice(range.from, range.to).map((cells, i) => ({ index: range.from + i, cells }));
  const columns: TableColumn<{ index: number; cells: string[] }>[] = version
    ? [
        ...version.columns.map((c, ci) => ({
          key: `${ci}-${c.name}`,
          header: c.name,
          align: c.type === 'number' ? ('right' as const) : ('left' as const),
          render: (row: { index: number; cells: string[] }) =>
            editable ? (
              <input
                type="text"
                className={styles.cellInput}
                aria-label={t.cell(row.index + 1, c.name)}
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
              <Button compact aria-label={t.removeRow(row.index + 1)} onClick={() => edit((g) => g.filter((_, i) => i !== row.index))}>
                <Icon name="close" />
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
    const next = pasteAt(grid, version.columns.length, Number(target.dataset.row), Number(target.dataset.col), pastedCells(text));
    edit(next);
    setInfo(t.pasted(pastedCells(text).length));
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
      setDialogError(e instanceof Error ? e.message : t.createFailed);
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
        toast(t.published(version.versionNo));
        setDialog(null);
      } else {
        const updated = await store.createRefTableVersion(table.id, { validFrom: validFrom as string, copyFrom: version.versionNo });
        const no = Math.max(...updated.versions.map((v) => v.versionNo));
        toast(t.created(no));
        setDialog(null);
        loadedKey.current = '';
        void navigate(url(table.id, no));
      }
      data.reload();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : '');
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (data.error) {
    body = <ErrorState what={t.loadFailed} next={t.loadFailedNext} actions={<Button compact onClick={data.reload}>{translate('flows.retry')}</Button>} />;
  } else if (data.loading && !data.data) {
    body = showSkeleton ? <SkeletonTable weights={[10, 16, 12, 12, 14]} rows={3} label="Loading the reference tables" /> : null;
  } else if (tables.length === 0 || !table || !version) {
    body = <EmptyState title={t.emptyTitle} text={isAdmin ? t.emptyText : t.emptyReader} action={isAdmin ? <Button variant="primary" onClick={() => { setDialogError(null); setDialog('newTable'); }}>{t.newTable}</Button> : null} />;
  } else {
    const sorted = [...table.versions].sort((a, b) => b.versionNo - a.versionNo);
    body = (
      <div className={styles.layout}>
        <ul className={styles.list} aria-label={t.list}>
          {tables.map((x: RefTableRecord) => (
            <li key={x.id}>
              <Link to={url(x.id)} className={styles.item} aria-current={x.id === table.id ? 'true' : undefined} onClick={guard(url(x.id))}>
                {x.name}
                <span className={styles.itemSub}>{tableSummary(x, today)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <section className={styles.detail} aria-label={t.detail}>
          <Card flush title={table.name}>
            <div className={styles.head}>
              <div className={styles.headText}>
                <h2>{table.name}</h2>
                {table.description ? <span className={styles.note}>{table.description}</span> : null}
              </div>
              <div className={styles.headActions}>
                {dirty ? (
                  <span className={styles.dirty} role="status">
                    {t.unsaved}
                  </span>
                ) : null}
                {editable ? (
                  <>
                    <Button onClick={() => { setPasteText(''); setDialogError(null); setDialog('paste'); }}>{t.paste}</Button>
                    <Button variant="primary" busy={busy === 'save'} disabled={!dirty} onClick={() => void save()}>
                      {busy === 'save' ? t.saving : t.save}
                    </Button>
                  </>
                ) : null}
                {isAdmin ? <Button onClick={() => { setDialogError(null); setDialog('newVersion'); }}>{t.newVersion}</Button> : null}
                {editable ? (
                  <Button variant="primary" disabled={dirty} onClick={() => { setDialogError(null); setDialog('publish'); }}>
                    {t.publish}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className={styles.chips} role="group" aria-label={t.versionsLabel}>
              {sorted.map((v) => (
                <Chip key={v.versionNo} pressed={v.versionNo === version.versionNo} onClick={() => go(url(table.id, v.versionNo))}>
                  {versionOptionLabel(v)}
                </Chip>
              ))}
              <Badge tone={version.status === 'draft' ? 'outline' : 'soft'}>{version.status === 'draft' ? 'Draft' : 'Published'}</Badge>
            </div>
            {dirty && editable ? <p className={styles.note} style={{ padding: '0 20px 12px' }}>{t.publishNeedsSave}</p> : null}
            {info ? (
              <p className={styles.note} style={{ padding: '0 20px 12px' }} role="status">
                {info}
              </p>
            ) : null}
            {errors.length > 0 ? (
              <div style={{ padding: '0 20px 12px' }}>
                <ErrorState what={t.rowErrors(errors.length)} next={`Row ${errors[0]!.row}, ${errors[0]!.column}: ${errors[0]!.message}`} />
              </div>
            ) : null}
            {saveError ? (
              <div style={{ padding: '0 20px 12px' }}>
                <ErrorState what={t.saveFailed} next={saveError} />
              </div>
            ) : null}
            <div className={styles.gridWrap} onPaste={onPaste}>
              {grid.length === 0 ? <p className={styles.note} style={{ padding: 20 }}>{t.noRows}</p> : <Table label={t.grid(table.name)} columns={columns} rows={pageRows} rowKey={(r) => String(r.index)} />}
            </div>
            {editable || range.pages > 1 ? (
              <div className={styles.pager}>
                {editable ? (
                  <Button compact onClick={() => { edit((g) => [...g, version.columns.map(() => '')]); setPage(pageRange(grid.length + 1, 999).page); }}>
                    {t.addRow}
                  </Button>
                ) : null}
                {grid.length > 0 ? <span className={styles.note}>{t.showing(range.from, range.to, grid.length)}</span> : null}
                {range.pages > 1 ? (
                  <>
                    <Button compact disabled={range.page === 0} onClick={() => setPage(range.page - 1)}>
                      {t.previous}
                    </Button>
                    <Button compact disabled={range.page >= range.pages - 1} onClick={() => setPage(range.page + 1)}>
                      {t.next}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className={styles.notes}>
              {!isAdmin ? <p className={styles.note}>{t.readOnlyUser}</p> : version.status === 'published' ? <p className={styles.note}>{t.readOnlyPublished}</p> : null}
              <p className={styles.note}>{usedByNames.length > 0 ? t.usedBy(usedByNames) : t.notUsed}</p>
            </div>
          </Card>
        </section>
        {dialog === 'paste' ? (
          <Dialog
            title={t.pasteTitle}
            onClose={() => setDialog(null)}
            actions={
              <>
                <Button onClick={() => setDialog(null)}>{t.cancel}</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const r = pasteIntoGrid(pasteText, version.columns);
                    if (!r.ok) {
                      setDialogError(r.message);
                      return;
                    }
                    edit(r.rows);
                    setPage(0);
                    setInfo(t.pasted(r.rows.length));
                    setDialog(null);
                  }}
                >
                  {t.pasteApply}
                </Button>
              </>
            }
          >
            <div className={styles.dialogBody}>
              <TextAreaField label={t.pasteLabel} hint={t.pasteHelp} mono rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} error={dialogError ?? undefined} />
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
        breadcrumb={<span>{strings.screens.refTables.crumb}</span>}
        title={strings.screens.refTables.title}
        subtitle={strings.screens.refTables.subtitle}
        action={isAdmin ? <Button variant="primary" onClick={() => { setDialogError(null); setDialog('newTable'); }}>{t.newTable}</Button> : undefined}
      >
        {body}
      </ScreenFrame>
      {dialog === 'newTable' ? <NewTableDialog busy={busy === 'table'} error={dialogError} onCreate={(n, d, x) => void createTable(n, d, x)} onCancel={() => setDialog(null)} /> : null}
      {pendingNav ? (
        <Dialog
          title={t.discardTitle}
          onClose={() => setPendingNav(null)}
          actions={
            <>
              <Button onClick={() => setPendingNav(null)}>{t.stay}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const to = pendingNav;
                  setPendingNav(null);
                  loadedKey.current = '';
                  void navigate(to);
                }}
              >
                {t.discard}
              </Button>
            </>
          }
        >
          {t.discardText}
        </Dialog>
      ) : null}
    </>
  );
}

function NewTableDialog({ busy, error, onCreate, onCancel }: { busy: boolean; error: string | null; onCreate: (name: string, description: string, text: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  return (
    <Dialog
      title={t.newTitle}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{t.cancel}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              if (!name.trim()) setLocal(`${t.emptyName} ${t.emptyNameNext}`);
              else {
                setLocal(null);
                onCreate(name, description, text);
              }
            }}
          >
            {t.create}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Field label={t.tableName} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t.tableDescription} value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextAreaField label={t.tablePaste} hint={t.tablePasteHelp} mono rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        {local ? <ErrorState what={t.createFailed} next={local} /> : null}
        {error ? <ErrorState what={t.createFailed} next={error} /> : null}
      </div>
    </Dialog>
  );
}

export type { Cell };
