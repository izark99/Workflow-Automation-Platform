import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BindableSetting } from '../../../engine/flow/bindable';
import type { FlowParameter, ParameterValue } from '../../../engine/flow/parameters';
import { Button, Dropdown, Icon } from '../../components';
import { useT } from '../../i18n';
import { bindingView, nowText, parametersThatFit } from './parameter-control-logic';
import styles from './parameter-control.module.css';

export interface ParameterControlProps {
  /** The name of the field, for the accessible name of the button: "Use a parameter for {field}". */
  field: string;
  setting: BindableSetting;
  /** The parameters of the flow. */
  parameters: readonly FlowParameter[];
  /** What the setting holds now: a fixed value or a binding. */
  value: unknown;
  readOnly: boolean;
  onBind: (key: string) => void;
  /** Gives the field back (the form puts its last fixed value in again). */
  onUnbind: () => void;
  /** The value that the run will use, shown as "Now: {value}" (the Test tab and the Run screen). */
  now?: { type: FlowParameter['type']; value: ParameterValue | null };
  /** Why the value cannot be resolved: what failed and what to do. Shown under the field. */
  error?: string;
  /** The input box of the fixed value. It is shown while the field is not bound. */
  children: ReactNode;
  /** Starts with the list open, for the components page. */
  defaultOpen?: boolean;
  /** Shows a bound field only, with no button to give it back (the Test tab and the Run screen show what a run will use). */
  viewOnly?: boolean;
}

/**
 * The parameter control of a single-value setting (SPEC 13.3, DESIGN "Parameter control"): the input box with a link button
 * beside it that lists the parameters that fit. A bound field is one row, with the parameter as a chip and a button that
 * gives the field back. Errors are shown under the field.
 */
export function ParameterControl({ field, setting, parameters, value, readOnly, onBind, onUnbind, now, error, children, defaultOpen, viewOnly = false }: ParameterControlProps) {
  const t = useT();
  const view = bindingView(value, parameters);
  const growRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState(0);
  // The children may start with a label; the link button sits level with the input box, not with the label (audit P6 F3).
  useLayoutEffect(() => {
    const box = growRef.current;
    const control = box?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button:not([data-infotip])');
    const next = box && control ? Math.max(0, Math.round(control.getBoundingClientRect().top - box.getBoundingClientRect().top)) : 0;
    setDrop((d) => (d === next ? d : next));
  });

  if (view.kind === 'fixed') {
    const fits = parametersThatFit(parameters, setting);
    return (
      <div className={styles.wrap}>
        <div className={styles.row}>
          <div className={styles.grow} ref={growRef}>{children}</div>
          <span className={styles.tip} style={drop > 0 ? { marginTop: drop } : undefined} title={fits.length === 0 && !readOnly ? t('builder.param.none') : undefined}>
            <Dropdown
              label={t('builder.param.use', { field })}
              iconTrigger="link"
              options={fits.map((p) => ({ value: p.key, label: p.label, hint: p.key }))}
              value=""
              userContent
              disabled={readOnly || fits.length === 0}
              defaultOpen={defaultOpen}
              onChange={onBind}
            />
          </span>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    );
  }

  const gone = view.kind === 'missing';
  return (
    <div className={styles.wrap}>
      {/* A bound field has no input, so its name is shown here. */}
      <span className={styles.fieldLabel} data-user-content={undefined}>{field}</span>
      <div className={styles.bound}>
        <span className={`${styles.chip} ${gone ? styles.chipError : ''}`}>
          <Icon name="link" />
          {gone ? (
            <span data-user-content title={t('builder.param.gone', { key: view.key })}>{t('builder.param.gone', { key: view.key })}</span>
          ) : (
            <>
              <span>{t('builder.param.chip')}</span>
              <span data-user-content title={view.label}>{view.label}</span>
            </>
          )}
        </span>
        {viewOnly ? null : (
          <Button compact disabled={readOnly} onClick={onUnbind}>
            {t('builder.param.fixed')}
          </Button>
        )}
      </div>
      {gone ? (
        <p className={styles.error} role="alert">{error ?? t('builder.param.goneNext')}</p>
      ) : error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : now ? (
        <p className={styles.now} data-user-content>{nowText(now.type, now.value)}</p>
      ) : null}
    </div>
  );
}
