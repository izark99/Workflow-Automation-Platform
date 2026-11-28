import { useState } from 'react';
import { parametersOf } from '../../../engine/flow/parameters';
import { Button, Checkbox, Field, Icon } from '../../components';
import { useT } from '../../i18n';
import { Bind } from '../parameter-control/bind';
import { SectionLabel } from './column-pickers';
import { checkFromSettings, checkMissing, checkToSettings, emptyRule } from './check-logic';
import type { CheckRuleRow, CheckValues } from './check-logic';
import { FormulaEditor } from './formula-editor';
import type { FormProps } from './types';
import { useSourceColumns } from './use-source-columns';
import styles from './column-pickers.module.css';

/** Check: the rules (a name, a condition that is true when the row is fine, a message) and whether a failure stops the run. */
export function CheckForm(props: FormProps) {
  const t = useT();
  const { step, onSettings, readOnly, definition } = props;
  const [v, setV] = useState<CheckValues>(() => checkFromSettings(step.settings));
  const source = useSourceColumns(props);
  const apply = (next: CheckValues): void => {
    setV(next);
    onSettings(checkToSettings(next, step.settings));
  };
  const patch = (i: number, change: Partial<CheckRuleRow>): void => apply({ ...v, rules: v.rules.map((r, j) => (j === i ? { ...r, ...change } : r)) });
  const missing = checkMissing(v);
  return (
    <div className={styles.rowCard} style={{ gap: 16, borderBottom: 0, padding: 0 }}>
      <div role="group" aria-label={t('builder.check.rules')} style={{ display: 'flex', flexDirection: 'column' }}>
        <SectionLabel label={t('builder.check.rules')} hint={t('builder.check.rulesHint')} flush />
        {v.rules.map((r, i) => (
          <div key={i} className={styles.rowCard}>
            <div className={styles.line}>
              <div className={styles.grow}>
                <Field label={t('common.numbered', { label: t('builder.check.ruleName'), n: i + 1 })} value={r.name} disabled={readOnly} onChange={(e) => patch(i, { name: e.target.value })} />
              </div>
              <Button icon disabled={readOnly} aria-label={t('builder.check.removeRule', { n: i + 1 })} onClick={() => apply({ ...v, rules: v.rules.filter((_, j) => j !== i) })}>
                <Icon name="x" />
              </Button>
            </div>
            <FormulaEditor
              label={t('common.numbered', { label: t('builder.check.condition'), n: i + 1 })}
              hint={t('builder.check.conditionHint')}
              value={r.condition}
              readOnly={readOnly}
              source={source}
              expect="boolean"
              parameters={parametersOf(definition)}
              rows={3}
              onChange={(condition) => patch(i, { condition })}
            />
            <Field label={t('common.numbered', { label: t('builder.check.message'), n: i + 1 })} value={r.message} disabled={readOnly} onChange={(e) => patch(i, { message: e.target.value })} />
          </div>
        ))}
        <div style={{ paddingTop: 8 }}>
          <Button size="sm" disabled={readOnly} onClick={() => apply({ ...v, rules: [...v.rules, emptyRule()] })}>
            {t('builder.check.addRule')}
          </Button>
        </div>
      </div>
      <Bind name="stop" label={t('builder.check.stop')}>
        <Checkbox checked={v.stop} disabled={readOnly} onChange={(stop) => apply({ ...v, stop })}>
          {t('builder.check.stop')}
        </Checkbox>
      </Bind>
      {missing.length > 0 ? (
        <p className={styles.note} role="status">
          {t('common.numbered', { label: t('builder.check.stillMissing'), n: missing.join(' ') })}
        </p>
      ) : null}
    </div>
  );
}
