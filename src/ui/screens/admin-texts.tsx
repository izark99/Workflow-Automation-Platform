import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Badge, Button, Card, Chip, Dialog, Dropdown, EmptyState, ErrorState, SearchField, SkeletonTable, Table, TextAreaField, useDelayedLoading, useToast } from '../components';
import type { Column } from '../components';
import { applyUiTexts, errorText, useT } from '../i18n';
import { useLoad, useStore } from '../store-context';
import type { UiTextLocale } from '../../store/types';
import { SCREEN_FILTERS, TEXT_LOCALES, filterPairRows, pageOf, pairChanges, textPairRows, validateTextPair } from './admin-texts-logic';
import type { TextCell, TextPairRow } from './admin-texts-logic';
import styles from './admin.module.css';

type Values = Record<UiTextLocale, string>;
type Problems = Partial<Record<UiTextLocale, string>>;

/** One language of a row: the current text, clamped to two lines, with an "Edited" badge under it when it differs from the default. */
function TextCellView({ cell }: { cell: TextCell }) {
  const t = useT();
  return (
    <div className={styles.cell}>
      <span className={styles.clamp} title={cell.current} data-user-content>
        {cell.current}
      </span>
      {cell.edited ? <Badge tone="soft">{t('admin.texts.edited')}</Badge> : null}
    </div>
  );
}

/** Admin, Texts tab (SPEC 12.3): both languages in one table, one dialog and one atomic Save. */
export function AdminTexts() {
  const t = useT();
  const store = useStore();
  const toast = useToast();
  const data = useLoad((s) => s.listUiTexts());
  const showSkeleton = useDelayedLoading(data.loading && !data.data);
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<TextPairRow | null>(null);
  const [values, setValues] = useState<Values>({ en: '', vi: '' });
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => textPairRows(data.data ?? []), [data.data]);
  const found = filterPairRows(rows, query, screen, editedOnly);
  const shown = pageOf(found, page);

  const refresh = async (): Promise<void> => {
    applyUiTexts(await store.listUiTexts());
    data.reload();
  };
  const startEdit = (row: TextPairRow): void => {
    setEditing(row);
    setValues({ en: row.en.current, vi: row.vi.current });
    setProblems({});
    setFailure(null);
  };
  const close = (): void => {
    setEditing(null);
    setFailure(null);
  };
  /** Runs one store action, then refreshes the texts. Returns whether it worked. */
  const apply = async (action: () => Promise<void>, done: string, failed: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast(done);
      return true;
    } catch (e) {
      setFailure(errorText(e, failed));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async (): Promise<void> => {
    if (!editing || busy) return;
    const check = validateTextPair(editing, values);
    if (!check.ok) {
      // Nothing is saved when either text fails; the error sits under the text that failed.
      const next: Problems = {};
      for (const locale of TEXT_LOCALES) {
        const e = check.errors[locale];
        if (e) next[locale] = t(e.key, e.params);
      }
      setProblems(next);
      return;
    }
    setProblems({});
    const changes = pairChanges(editing, values);
    if (changes.entries.length === 0 && changes.resets.length === 0) {
      close();
      return;
    }
    if (await apply(() => store.saveUiTexts(changes), t('admin.texts.saved'), t('admin.texts.saveFailed'))) close();
  };
  const resetBoth = async (row: TextPairRow, thenClose: boolean): Promise<void> => {
    const resets = TEXT_LOCALES.filter((l) => row[l].edited).map((locale) => ({ locale, key: row.key }));
    if (resets.length === 0) {
      if (thenClose) close();
      return;
    }
    if (await apply(() => store.saveUiTexts({ entries: [], resets }), t('admin.texts.resetDone'), t('admin.texts.resetFailed')) && thenClose) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  };

  const columns: Column<TextPairRow>[] = [
    { key: 'key', header: t('admin.texts.cols.key'), width: 220, userContent: true, render: (r) => <span className={styles.keyText} title={r.key} data-code>{r.key}</span> },
    { key: 'en', header: t('admin.texts.cols.english'), render: (r) => <TextCellView cell={r.en} /> },
    { key: 'vi', header: t('admin.texts.cols.vietnamese'), render: (r) => <TextCellView cell={r.vi} /> },
    {
      key: 'actions',
      header: t('admin.texts.cols.actions'),
      width: 180,
      render: (r) => (
        <div className={styles.actions}>
          <Button size="sm" aria-label={t('admin.texts.editLabel', { key: r.key })} onClick={() => startEdit(r)}>
            {t('admin.texts.edit')}
          </Button>
          {r.en.edited || r.vi.edited ? (
            <Button size="sm" aria-label={t('admin.texts.resetLabel', { key: r.key })} onClick={() => void resetBoth(r, false)}>
              {t('admin.texts.reset')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  let body;
  if (data.error) body = <ErrorState what={t('admin.texts.loadFailed')} next={errorText(data.error)} actions={<Button size="sm" onClick={data.reload}>{t('flows.retry')}</Button>} />;
  else if (!data.data) body = showSkeleton ? <SkeletonTable weights={[22, 30, 30, 18]} rows={3} label={t('admin.texts.loading')} /> : null;
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
        <Chip pressed={editedOnly} onClick={() => { setEditedOnly(!editedOnly); setPage(0); }}>
          {t('admin.texts.editedOnly')}
        </Chip>
      </div>
      <Card flush title={t('admin.texts.table')}>
        <div className={styles.tableSlot} aria-busy={data.loading ? 'true' : undefined}>
          {body}
        </div>
        {data.data && found.length > 0 ? (
          <div className={`${styles.foot} ${styles.pager}`}>
            <span className={styles.note}>{t('admin.texts.showing', { from: shown.from.toLocaleString('en-US'), to: shown.to.toLocaleString('en-US'), total: found.length.toLocaleString('en-US') })}</span>
            {shown.pages > 1 ? (
              <>
                <Button size="sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>
                  {t('admin.texts.previous')}
                </Button>
                <Button size="sm" disabled={page >= shown.pages - 1} onClick={() => setPage(page + 1)}>
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
          width={880}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{t('admin.texts.cancel')}</Button>
              <Button disabled={busy || !(editing.en.edited || editing.vi.edited)} onClick={() => void resetBoth(editing, true)}>
                {t('admin.texts.resetBoth')}
              </Button>
              <Button variant="primary" busy={busy} onClick={() => void save()}>
                {t('admin.texts.save')}
              </Button>
            </>
          }
        >
          <div className={styles.dialogBody} onKeyDown={onKey}>
            <span>
              <b>{t('admin.texts.keyLabel')}</b>: <span data-code>{editing.key}</span>
            </span>
            {failure ? <ErrorState what={t('admin.texts.saveFailed')} next={failure} /> : null}
            {/* The DOM order is English, Vietnamese, then the two Reset buttons; the grid puts each Reset under its default. */}
            <div className={styles.pairGrid}>
              {TEXT_LOCALES.map((locale) => (
                <div key={locale} className={styles.pairText} style={{ gridColumn: locale === 'en' ? 1 : 2 }}>
                  <TextAreaField
                    label={t(locale === 'en' ? 'admin.texts.textEnglish' : 'admin.texts.textVietnamese')}
                    hint={t('admin.texts.valueHint')}
                    rows={5}
                    userContent
                    value={values[locale]}
                    onChange={(e) => setValues({ ...values, [locale]: e.target.value })}
                    error={problems[locale]}
                  />
                  <span className={styles.defaultText}>
                    {t('admin.texts.defaultLabel')}: <span data-user-content>{editing[locale].defaultText}</span>
                  </span>
                </div>
              ))}
              {TEXT_LOCALES.map((locale) => (
                <div key={`reset-${locale}`} style={{ gridColumn: locale === 'en' ? 1 : 2, gridRow: 2 }}>
                  <Button size="sm" disabled={values[locale] === editing[locale].defaultText} onClick={() => setValues({ ...values, [locale]: editing[locale].defaultText })}>
                    {t(locale === 'en' ? 'admin.texts.resetEnglish' : 'admin.texts.resetVietnamese')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
