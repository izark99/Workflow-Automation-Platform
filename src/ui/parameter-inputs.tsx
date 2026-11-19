import { useState } from 'react';
import type { FlowParameter, ParameterValue } from '../engine/flow/parameters';
import { Button, Checkbox, DatePicker, Dropdown, Field, InfoTip } from './components';
import { useT } from './i18n';
import { todayIso } from './screens/flows-logic';
import styles from './parameter-inputs.module.css';

export interface ParameterInputsProps {
  parameters: readonly FlowParameter[];
  values: Record<string, ParameterValue | undefined>;
  /** A blank value is `undefined`. */
  onChange: (key: string, value: ParameterValue | undefined) => void;
  /** The error of each invalid parameter, by key. It is shown under the field. */
  errors: Record<string, string>;
  disabled?: boolean;
  width?: number;
}

/** One input for each parameter, in the control of its type. Used by the Test tab of the builder and by the Run screen. */
export function ParameterInputs({ parameters, values, onChange, errors, disabled = false, width = 338 }: ParameterInputsProps) {
  // An error shows after the user changed the field or left it, not on arrival (checklist item 6). The parent says
  // what is missing in a note, so a blank required field is not a surprise.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (key: string): void => setTouched((s) => (s.has(key) ? s : new Set(s).add(key)));
  return (
    <div className={styles.stack}>
      {parameters.map((p) => (
        <div key={p.key} onBlur={() => touch(p.key)}>
          <ParameterInput
            p={p}
            value={values[p.key]}
            error={touched.has(p.key) ? errors[p.key] : undefined}
            disabled={disabled}
            width={width}
            onChange={(v) => {
              touch(p.key);
              onChange(p.key, v);
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** A quiet note that says which values are still missing, so that a disabled Run button explains itself. Empty when all are valid. */
export function PendingParametersNote({ parameters, errors, action }: { parameters: readonly FlowParameter[]; errors: Record<string, string>; action: 'run' | 'preview' }) {
  const t = useT();
  const labels = parameters.filter((p) => errors[p.key]).map((p) => p.label);
  if (labels.length === 0) return null;
  return (
    <p className={styles.note} role="status">
      {t(action === 'run' ? 'run.params.pendingRun' : 'run.params.pendingPreview', { names: labels.join(', ') })}
    </p>
  );
}

function ParameterInput({ p, value, error, disabled, width, onChange }: { p: FlowParameter; value: ParameterValue | undefined; error: string | undefined; disabled: boolean; width: number; onChange: (v: ParameterValue | undefined) => void }) {
  const t = useT();
  // A switch is never required, so it carries no "(optional)" suffix.
  const label = p.required || p.type === 'boolean' ? p.label : t('run.params.optional', { label: p.label });
  const errorLine = error ? <p className={styles.error} role="alert">{error}</p> : null;
  const heading = (
    <span className={styles.labelRow}>
      <span className={styles.label} data-user-content>{label}</span>
      {p.help ? <InfoTip label={p.label}>{p.help}</InfoTip> : null}
    </span>
  );
  switch (p.type) {
    case 'text':
      return <Field label={label} userLabel hint={p.help} value={typeof value === 'string' ? value : ''} disabled={disabled} error={error} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />;
    case 'number':
      return <NumberInput label={label} hint={p.help} value={value} disabled={disabled} error={error} onChange={onChange} />;
    case 'date':
      return (
        <div className={styles.block}>
          {heading}
          {typeof value === 'string' ? (
            <div className={styles.inline}>
              <DatePicker label={p.label} value={value} disabled={disabled} width={width - (p.required ? 0 : 96)} onChange={onChange} />
              {p.required ? null : (
                <Button disabled={disabled} aria-label={t('run.params.clearLabel', { label: p.label })} onClick={() => onChange(undefined)}>
                  {t('run.params.clear')}
                </Button>
              )}
            </div>
          ) : (
            <div>
              <Button disabled={disabled} aria-label={t('run.params.chooseDateLabel', { label: p.label })} onClick={() => onChange(todayIso())}>
                {t('run.params.chooseDate')}
              </Button>
            </div>
          )}
          {errorLine}
        </div>
      );
    case 'list':
      return (
        <div className={styles.block}>
          {heading}
          <Dropdown
            label={p.label}
            options={[{ value: '', label: t('run.params.chooseOption') }, ...(p.options ?? []).map((o) => ({ value: o, label: o }))]}
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            width="100%"
            userContent
            onChange={(v) => onChange(v === '' ? undefined : v)}
          />
          {errorLine}
        </div>
      );
    case 'boolean':
      return (
        <div className={styles.block}>
          <div className={styles.labelRow}>
            <Checkbox checked={value === true} disabled={disabled} onChange={(checked) => onChange(checked)}>
              <span data-user-content>{label}</span>
            </Checkbox>
            {p.help ? <InfoTip label={p.label}>{p.help}</InfoTip> : null}
          </div>
          {errorLine}
        </div>
      );
  }
}

/** A number is typed as text, so "-" and "1." can be written on the way; the value follows when the text is a number. */
function NumberInput({ label, hint, value, disabled, error, onChange }: { label: string; hint: string | undefined; value: ParameterValue | undefined; disabled: boolean; error: string | undefined; onChange: (v: ParameterValue | undefined) => void }) {
  const [text, setText] = useState(typeof value === 'number' ? String(value) : '');
  const same = text.trim() === '' ? value === undefined : Number(text) === value;
  return (
    <Field
      label={label}
      userLabel
      hint={hint}
      inputMode="decimal"
      value={same ? text : typeof value === 'number' ? String(value) : ''}
      disabled={disabled}
      error={error}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next.trim() === '') onChange(undefined);
        else if (Number.isFinite(Number(next))) onChange(Number(next));
        else onChange(Number.NaN); // not a number: the engine rule reports it, and the run stays disabled
      }}
    />
  );
}
