import { useMemo, useState } from 'react';
import { Badge, Button, Card, Dialog, Dropdown, EmptyState, ErrorState, SearchField, SkeletonTable, Table, TextAreaField, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { applyUiTexts, errorText, useT } from '../i18n';
import { useLoad, useStore } from '../store-context';
import type { UiTextLocale } from '../../store/types';
import { SCREEN_FILTERS, checkEdit, filterTextRows, pageOf, textRows } from './admin-texts-logic';
import type { TextRow } from './admin-texts-logic';
import styles from './admin.module.css';

/** Admin, Texts tab (SPEC 11.3): search, filter by screen, language, default next to the current value, edit, reset. */
export function AdminTexts() {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const data = useLoad((s) => s.listUiTexts());
  const showSkeleton = useDelayedLoading(data.loading && !data.data);
  const [locale, setLocale] = useState<UiTextLocale>('vi');
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<TextRow | null>(null);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => textRows(locale, data.data ?? []), [locale, data.data]);
  const found = filterTextRows(rows, query, screen);
  const shown = pageOf(found, page);

  const refresh = async (): Promise<void> => {
    applyUiTexts(await store.listUiTexts());
    data.reload();
  };
  const startEdit = (row: TextRow): void => {
    setEditing(row);
    setValue(row.current);
    setProblem(null);
  };
  const save = async (): Promise<void> => {
    if (!editing) return;
    const check = checkEdit(editing.defaultText, value);
    if (!check.ok) {
      setProblem(t(check.error.key, check.error.params));
      return;
    }
    setBusy(true);
    try {
      await store.saveUiText({ locale, key: editing.key, value });
      await refresh();
      toast(t('admin.texts.saved'));
      setEditing(null);
    } catch (e) {
      setProblem(errorText(e, t('admin.texts.saveFailed')));
    } finally {
      setBusy(false);
    }
  };
  const reset = async (row: TextRow): Promise<void> => {
    try {
      await store.resetUiText(locale, row.key);
      await refresh();
      toast(t('admin.texts.resetDone'));
    } catch (e) {
      setProblem(errorText(e, t('admin.texts.resetFailed')));
    }
  };

  const columns: Column<TextRow>[] = [
    { key: 'key', header: t('admin.texts.cols.key'), userContent: true, render: (r) => <span className={styles.keyText} data-code>{r.key}</span> },
    { key: 'default', header: t('admin.texts.cols.default'), userContent: true, render: (r) => <span className={styles.clip} title={r.defaultText}>{r.defaultText}</span> },
    {
      key: 'current',
      header: t('admin.texts.cols.current'),
      userContent: true,
      render: (r) => (
        <span className={styles.clip} title={r.current}>
          {r.current}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('admin.texts.cols.actions'),
      render: (r) => (
        <div className={styles.actions}>
          {r.edited ? <Badge tone="soft">{t('admin.texts.edited')}</Badge> : null}
          <Button compact aria-label={t('admin.texts.editLabel', { key: r.key })} onClick={() => startEdit(r)}>
            {t('admin.texts.edit')}
          </Button>
          {r.edited ? (
            <Button compact aria-label={t('admin.texts.resetLabel', { key: r.key })} onClick={() => void reset(r)}>
              {t('admin.texts.reset')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  let body;
  if (data.error) body = <ErrorState what={t('admin.texts.loadFailed')} next={errorText(data.error)} actions={<Button compact onClick={data.reload}>{t('flows.retry')}</Button>} />;
  else if (!data.data) body = showSkeleton ? <SkeletonTable weights={[26, 30, 30, 14]} rows={3} label={t('admin.texts.loading')} /> : null;
  else if (found.length === 0) body = <EmptyState title={t('admin.texts.noMatch')} text="" action={null} />;
  else body = <Table label={t('admin.texts.table')} columns={columns} rows={shown.rows} rowKey={(r) => r.key} />;

  return (
    <>
      <div className={styles.textsToolbar}>
        <span className={styles.textsSearch}>
          <SearchField label={t('admin.texts.search')} placeholder={t('admin.texts.searchPlaceholder')} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
        </span>
        <Dropdown
          label={t('admin.texts.screen')}
          options={[{ value: '', label: t('admin.texts.allScreens') }, ...SCREEN_FILTERS.map((s) => ({ value: s, label: s }))]}
          value={screen}
          onChange={(v) => { setScreen(v); setPage(0); }}
          width={180}
        />
        <Dropdown
          label={t('admin.texts.language')}
          options={[{ value: 'vi', label: t('language.vi') }, { value: 'en', label: t('language.en') }]}
          value={locale}
          onChange={(v) => { setLocale(v === 'en' ? 'en' : 'vi'); setPage(0); }}
          width={180}
        />
      </div>
      {problem && !editing ? <ErrorState what={t('admin.texts.saveFailed')} next={problem} /> : null}
      <Card flush title={t('admin.texts.table')}>
        <div className={styles.tableSlot} aria-busy={data.loading ? 'true' : undefined}>
          {body}
        </div>
        {data.data && found.length > 0 ? (
          <div className={`${styles.foot} ${styles.pager}`}>
            <span className={styles.note}>{t('admin.texts.showing', { from: shown.from.toLocaleString('en-US'), to: shown.to.toLocaleString('en-US'), total: found.length.toLocaleString('en-US') })}</span>
            {shown.pages > 1 ? (
              <>
                <Button compact disabled={page <= 0} onClick={() => setPage(page - 1)}>
                  {t('admin.texts.previous')}
                </Button>
                <Button compact disabled={page >= shown.pages - 1} onClick={() => setPage(page + 1)}>
                  {t('admin.texts.next')}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </Card>
      {editing ? (
        <Dialog
          title={t('admin.texts.editTitle')}
          onClose={() => setEditing(null)}
          actions={
            <>
              <Button onClick={() => setEditing(null)}>{t('admin.texts.cancel')}</Button>
              <Button variant="primary" busy={busy} onClick={() => void save()}>
                {t('admin.texts.save')}
              </Button>
            </>
          }
        >
          <div className={styles.dialogBody}>
            <span>
              <b>{t('admin.texts.keyLabel')}</b>: <span data-code>{editing.key}</span>
            </span>
            <span>
              <b>{t('admin.texts.defaultLabel')}</b>: <span data-user-content>{editing.defaultText}</span>
            </span>
            <TextAreaField label={t('admin.texts.value')} hint={t('admin.texts.valueHint')} rows={5} value={value} onChange={(e) => setValue(e.target.value)} error={problem ?? undefined} data-user-content />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
