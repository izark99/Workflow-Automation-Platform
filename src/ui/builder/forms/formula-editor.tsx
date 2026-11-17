import { useLayoutEffect, useRef, useState } from 'react';
import type { Column } from '../../../engine/types';
import { Button, Dialog, Dropdown, ErrorState, SearchField, TextAreaField } from '../../components';
import { todayIso } from '../../screens/flows-logic';
import { formulaStrings as t } from '../../strings';
import { COMMON_FUNCTIONS, FUNCTION_DOCS, GROUP_ORDER, searchFunctions } from './function-docs';
import { checkFormula, columnReference, functionInsert, insertAtCursor } from './formula-logic';
import type { SourceColumns } from './use-source-columns';
import styles from './formula-editor.module.css';

export interface FormulaEditorProps {
  label: string;
  hint: string;
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  source: SourceColumns;
  /** The type the result must have, for example boolean for a Filter condition. */
  expect?: Column['type'];
  rows?: number;
}

/** A formula editor: the text, a message about it, buttons that insert functions and columns, and the list of all functions. */
export function FormulaEditor({ label, hint, value, onChange, readOnly, source, expect, rows = 7 }: FormulaEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Where the cursor goes after the next render. It is set in the same commit that writes the new text, so typing right
  // after an insert cannot land at the old cursor position.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(caret, caret);
  });
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState('');
  const state = checkFormula(value, source.columns, todayIso(), expect);
  const bad = state.kind === 'syntax_error' || state.kind === 'invalid' || state.kind === 'empty';

  const insert = (text: string, caretBack = 0): void => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const r = insertAtCursor(value, start, end, text, caretBack);
    pendingCaret.current = r.caret;
    onChange(r.text);
  };
  const insertFunction = (signature: string): void => {
    const f = functionInsert(signature);
    insert(f.insert, f.caretBack);
  };

  const found = searchFunctions(query);
  return (
    <div className={styles.block}>
      <TextAreaField
        label={label}
        hint={hint}
        mono
        rows={rows}
        textareaRef={ref}
        value={value}
        disabled={readOnly}
        error={bad ? state.message : undefined}
        status={bad ? undefined : state.message}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={styles.label}>{t.insertFunction}</span>
      <div className={styles.chips} role="group" aria-label={t.insertFunction}>
        {COMMON_FUNCTIONS.map((name) => {
          const doc = FUNCTION_DOCS.find((f) => f.name === name)!;
          return (
            <Button key={name} compact disabled={readOnly} aria-label={t.insertFunctionLabel(name)} onClick={() => insertFunction(doc.signature)}>
              <span className={styles.mono}>{name}</span>
            </Button>
          );
        })}
        <Button compact onClick={() => { setQuery(''); setListOpen(true); }}>
          {t.allFunctions}
        </Button>
      </div>
      {source.columns ? (
        <Dropdown
          label={t.insertColumn}
          options={[{ value: '', label: t.insertColumn }, ...source.columns.map((c) => ({ value: c.name, label: c.name }))]}
          value=""
          disabled={readOnly}
          width={338}
          onChange={(name) => name && insert(columnReference(name))}
        />
      ) : (
        <div>
          <Button compact busy={source.loading} onClick={() => void source.load()}>
            {t.loadColumns}
          </Button>
        </div>
      )}
      {source.error ? <ErrorState what={t.loadFailed} next={source.error} /> : null}
      {listOpen ? (
        <Dialog title={t.functionsTitle} onClose={() => setListOpen(false)} actions={<Button onClick={() => setListOpen(false)}>{t.close}</Button>}>
          <div className={styles.dialogBody}>
            <SearchField label={t.searchFunctions} placeholder={t.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
            {found.length === 0 ? <span>{t.noFunctions}</span> : null}
            <ul className={styles.list} aria-label={t.functionsTitle}>
              {GROUP_ORDER.flatMap((group) => {
                const items = found.filter((f) => f.group === group);
                return items.length === 0
                  ? []
                  : [
                      <li key={`g-${group}`} className={styles.group}>
                        {group}
                      </li>,
                      ...items.map((f) => (
                        <li key={f.name} className={styles.item}>
                          <span className={styles.itemText}>
                            <span className={styles.signature}>{f.signature}</span>
                            <span className={styles.text}>{f.text}</span>
                          </span>
                          <Button
                            compact
                            disabled={readOnly}
                            aria-label={t.insertFunctionLabel(f.name)}
                            onClick={() => {
                              insertFunction(f.signature);
                              setListOpen(false);
                            }}
                          >
                            {t.insertShort}
                          </Button>
                        </li>
                      )),
                    ];
              })}
            </ul>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
