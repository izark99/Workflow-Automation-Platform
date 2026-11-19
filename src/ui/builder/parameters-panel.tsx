import { useState } from 'react';
import type { FlowDefinition } from '../../engine/flow/types';
import { PARAMETER_TYPES, parametersOf, withParameters } from '../../engine/flow/parameters';
import type { FlowParameter, ParameterType } from '../../engine/flow/parameters';
import type { MessageKey } from '../i18n';
import { Button, Checkbox, DatePicker, Dropdown, ErrorState, Field, InfoTip, TextAreaField } from '../components';
import { useT } from '../i18n';
import { todayIso } from '../screens/flows-logic';
import { addParameter, changeType, moveParameter, optionsFromText, optionsToText, parameterProblems, removeParameter, updateParameter } from './parameters-logic';
import styles from './parameters-panel.module.css';

export interface ParametersPanelProps {
  definition: FlowDefinition;
  onChange: (next: FlowDefinition) => void;
  readOnly: boolean;
}

/**
 * The parameters of the version: values that the user gives on the Run screen and that formulas read with PARAM("key").
 * Every change goes through `withParameters`, the only code that writes schema version 2.
 */
export function ParametersPanel({ definition, onChange, readOnly }: ParametersPanelProps) {
  const t = useT();
  const list = parametersOf(definition);
  const set = (next: FlowParameter[]): void => onChange(withParameters(definition, next));
  const problems = parameterProblems(list);

  return (
    <section aria-label={t('builder.params.title')} className={styles.panel}>
      <div className={styles.titleRow}>
        <h2>{t('builder.params.title')}</h2>
        <InfoTip label={t('builder.params.title')}>{t('builder.params.info')}</InfoTip>
      </div>
      {readOnly ? <p className={styles.note}>{t('builder.params.readOnly')}</p> : null}
      {list.length === 0 ? <p className={styles.note}>{t('builder.params.empty')}</p> : null}
      <ol className={styles.list} aria-label={t('builder.params.title')}>
        {list.map((p, i) => (
          <li key={i} className={styles.item}>
            <ParameterForm
              index={i}
              count={list.length}
              p={p}
              readOnly={readOnly}
              onPatch={(patch) => set(updateParameter(list, i, patch))}
              onType={(type) => set(changeType(list, i, type))}
              onMove={(d) => set(moveParameter(list, i, d))}
              onRemove={() => set(removeParameter(list, i))}
            />
          </li>
        ))}
      </ol>
      {problems.length > 0 ? (
        <ErrorState what={t('builder.params.problems')} next={problems.join(' ')} />
      ) : null}
      <div>
        <Button disabled={readOnly} onClick={() => set(addParameter(list))}>
          {t('builder.params.add')}
        </Button>
      </div>
    </section>
  );
}

function ParameterForm({
  index,
  count,
  p,
  readOnly,
  onPatch,
  onType,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  p: FlowParameter;
  readOnly: boolean;
  onPatch: (patch: Partial<FlowParameter>) => void;
  onType: (type: ParameterType) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const n = index + 1;
  const num = (label: string) => t('common.numbered', { label, n });
  return (
    <div className={styles.form} role="group" aria-label={t('builder.params.itemLabel', { n })}>
      <Field label={num(t('builder.params.label'))} value={p.label} disabled={readOnly} onChange={(e) => onPatch({ label: e.target.value })} />
      <Field label={num(t('builder.params.key'))} hint={t('builder.params.keyHint')} value={p.key} disabled={readOnly} onChange={(e) => onPatch({ key: e.target.value })} />
      <div className={styles.row}>
        <span className={styles.fieldLabel}>{num(t('builder.params.type'))}</span>
        <Dropdown
          label={num(t('builder.params.type'))}
          options={PARAMETER_TYPES.map((x) => ({ value: x, label: t(`builder.params.types.${x}` as MessageKey) }))}
          value={p.type}
          disabled={readOnly}
          width={338}
          onChange={(v) => onType(v as ParameterType)}
        />
      </div>
      {p.type === 'list' ? (
        <OptionsField label={num(t('builder.params.options'))} options={p.options ?? []} readOnly={readOnly} onChange={(options) => onPatch({ options })} />
      ) : null}
      <DefaultValue n={n} p={p} readOnly={readOnly} onPatch={onPatch} />
      <Checkbox checked={p.required} disabled={readOnly} onChange={(required) => onPatch({ required })}>
        {num(t('builder.params.required'))}
      </Checkbox>
      <Field label={num(t('builder.params.help'))} hint={t('builder.params.helpHint')} value={p.help ?? ''} disabled={readOnly} onChange={(e) => onPatch({ help: e.target.value })} />
      <div className={styles.actions}>
        <Button compact disabled={readOnly || index === 0} aria-label={t('builder.params.moveUpLabel', { n })} onClick={() => onMove(-1)}>
          {t('builder.params.moveUp')}
        </Button>
        <Button compact disabled={readOnly || index === count - 1} aria-label={t('builder.params.moveDownLabel', { n })} onClick={() => onMove(1)}>
          {t('builder.params.moveDown')}
        </Button>
        <Button compact variant="danger" disabled={readOnly} aria-label={t('builder.params.deleteLabel', { n })} onClick={onRemove}>
          {t('builder.params.delete')}
        </Button>
      </div>
    </div>
  );
}

/** The options of a list, one per line. The text box keeps what is typed; it follows the parameter when the list is moved. */
function OptionsField({ label, options, readOnly, onChange }: { label: string; options: string[]; readOnly: boolean; onChange: (options: string[]) => void }) {
  const t = useT();
  const [text, setText] = useState(optionsToText(options));
  const same = JSON.stringify(optionsFromText(text)) === JSON.stringify(options);
  return (
    <TextAreaField
      label={label}
      hint={t('builder.params.optionsHint')}
      rows={3}
      userContent
      disabled={readOnly}
      value={same ? text : optionsToText(options)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(optionsFromText(e.target.value));
      }}
    />
  );
}

/** The default value, in the control of the type. A default is optional: the Run screen fills the form with it. */
function DefaultValue({ n, p, readOnly, onPatch }: { n: number; p: FlowParameter; readOnly: boolean; onPatch: (patch: Partial<FlowParameter>) => void }) {
  const t = useT();
  const label = t('common.numbered', { label: t('builder.params.default'), n });
  const [numberText, setNumberText] = useState(typeof p.default === 'number' ? String(p.default) : '');
  const sameNumber = numberText.trim() === '' ? p.default === undefined : Number(numberText) === p.default;
  switch (p.type) {
    case 'date':
      return (
        <div className={styles.row}>
          <span className={styles.fieldLabel}>{label}</span>
          <div className={styles.inline}>
            <DatePicker label={label} value={typeof p.default === 'string' ? p.default : todayIso()} disabled={readOnly} width={180} onChange={(iso) => onPatch({ default: iso })} />
            <Button compact disabled={readOnly || p.default === undefined} aria-label={t('common.numbered', { label: t('builder.params.noDefault'), n })} onClick={() => onPatch({ default: undefined })}>
              {t('builder.params.noDefault')}
            </Button>
          </div>
          {p.default === undefined ? <span className={styles.note}>{t('builder.params.noDefaultNote')}</span> : null}
        </div>
      );
    case 'number':
      return (
        <Field
          label={label}
          inputMode="decimal"
          value={sameNumber ? numberText : p.default === undefined ? '' : String(p.default)}
          disabled={readOnly}
          onChange={(e) => {
            const text = e.target.value;
            setNumberText(text);
            if (text.trim() === '') onPatch({ default: undefined });
            else if (Number.isFinite(Number(text))) onPatch({ default: Number(text) });
          }}
        />
      );
    case 'boolean':
      return (
        <Checkbox checked={p.default === true} disabled={readOnly} onChange={(checked) => onPatch({ default: checked })}>
          {t('common.numbered', { label: t('builder.params.defaultChecked'), n })}
        </Checkbox>
      );
    case 'list':
      return (
        <div className={styles.row}>
          <span className={styles.fieldLabel}>{label}</span>
          <Dropdown
            label={label}
            options={[{ value: '', label: t('builder.params.noDefault') }, ...(p.options ?? []).map((o) => ({ value: o, label: o }))]}
            value={typeof p.default === 'string' ? p.default : ''}
            disabled={readOnly}
            width={338}
            userContent
            onChange={(v) => onPatch({ default: v === '' ? undefined : v })}
          />
        </div>
      );
    default:
      return <Field label={label} value={typeof p.default === 'string' ? p.default : ''} disabled={readOnly} onChange={(e) => onPatch({ default: e.target.value === '' ? undefined : e.target.value })} />;
  }
}
