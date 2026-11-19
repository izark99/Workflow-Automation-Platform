import { useState } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import { NODE_PORTS } from '../../engine/flow/types';
import type { ParameterValue } from '../../engine/flow/parameters';
import type { RefTable } from '../../engine/versions';
import { Button, Dropdown, ErrorState, Field, InfoTip, Tabs } from '../components';
import { useT } from '../i18n';
import { currentSource, deleteSteps, updateSettings, inputHandlesOf, inputTitle, renameStep, setInput, sourceOptions, STEP_CATALOG, stepNumbers } from './graph';
import { FORMS } from './forms';
import type { FormContext } from './forms/types';
import { ParametersPanel } from './parameters-panel';
import { StepPreview } from './step-preview';
import styles from './settings-panel.module.css';

export type SettingsTab = 'setup' | 'configure' | 'test';

export interface SettingsPanelProps {
  definition: FlowDefinition;
  /** The selected step, or undefined when none or several are selected. */
  step: FlowNode | undefined;
  onChange: (next: FlowDefinition) => void;
  onDeleted: () => void;
  readOnly: boolean;
  /** Test files by input key, and what the preview needs to resolve reference tables. */
  testFiles: Record<string, File>;
  onTestFile: (key: string, file: File) => void;
  refTables: RefTable[];
  /** Test values of the parameters, by key. */
  parameterValues: Record<string, ParameterValue | undefined>;
  onParameterValue: (key: string, value: ParameterValue | undefined) => void;
}

/** The 380 px panel at the right: the selected step with the tabs Setup, Configure and Test. */
export function SettingsPanel({ definition, step, onChange, onDeleted, readOnly, testFiles, onTestFile, refTables, parameterValues, onParameterValue }: SettingsPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>('setup');
  const [error, setError] = useState<string | null>(null);

  if (!step) {
    return (
      <aside aria-label={t('builder.settings.panel')} className={styles.panel}>
        <ParametersPanel definition={definition} onChange={onChange} readOnly={readOnly} />
        <p className={styles.note}>{t('builder.settings.none')}</p>
      </aside>
    );
  }
  const number = stepNumbers(definition).get(step.id) ?? 0;
  const label = step.label ?? step.id;

  return (
    <aside aria-label={t('builder.settings.panel')} className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <h2 data-user-content>{`${number}. ${label}`}</h2>
          <InfoTip label={label}>{t('builder.stepInfo', { type: STEP_CATALOG[step.type].label, hint: STEP_CATALOG[step.type].hint })}</InfoTip>
        </div>
        <p className={styles.note}>{STEP_CATALOG[step.type].label}</p>
      </div>
      <Tabs
        label={t('builder.settings.tabsLabel')}
        tabs={[
          { id: 'setup', label: t('builder.settings.tabs.setup') },
          { id: 'configure', label: t('builder.settings.tabs.configure') },
          { id: 'test', label: t('builder.settings.tabs.test') },
        ]}
        selected={tab}
        onSelect={(id) => setTab(id as SettingsTab)}
      >
        <div className={styles.stack}>
          {readOnly ? <p className={styles.note}>{t('builder.settings.readOnly')}</p> : null}
          {tab === 'setup' ? (
            <SetupTab key={step.id} definition={definition} step={step} onChange={onChange} readOnly={readOnly} error={error} setError={setError} />
          ) : null}
          {tab === 'configure' ? <ConfigureTab step={step} definition={definition} onChange={onChange} readOnly={readOnly} context={{ testFiles, refTables, parameterValues }} /> : null}
          {tab === 'test' ? <StepPreview key={step.id} definition={definition} step={step} files={testFiles} onFile={onTestFile} refTables={refTables} parameterValues={parameterValues} onParameterValue={onParameterValue} /> : null}
        </div>
      </Tabs>
      <div className={styles.footer}>
        <Button
          variant="danger"
          disabled={readOnly}
          onClick={() => {
            onChange(deleteSteps(definition, [step.id]));
            onDeleted();
          }}
        >
          {t('builder.settings.deleteStep')}
        </Button>
      </div>
    </aside>
  );
}

function SetupTab({ definition, step, onChange, readOnly, error, setError }: { definition: FlowDefinition; step: FlowNode } & Pick<SettingsPanelProps, 'onChange' | 'readOnly'> & { error: string | null; setError: (e: string | null) => void }) {
  const t = useT();
  const [name, setName] = useState(step.label ?? step.id);
  const [nameError, setNameError] = useState(false);
  const ports = NODE_PORTS[step.type].inputs;
  const inputs = ports.kind === 'fixed' && ports.handles.length === 0 ? [] : inputHandlesOf(definition, step);
  const options = sourceOptions(definition, step.id);

  return (
    <>
      <Field
        label={t('builder.settings.stepName')}
        hint={t('builder.settings.stepNameHint')}
        value={name}
        disabled={readOnly}
        error={nameError ? `${t('builder.settings.emptyStepName')} ${t('builder.settings.emptyStepNameNext')}` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          const clean = e.target.value.trim();
          setNameError(clean === '');
          if (clean !== '') onChange(renameStep(definition, step.id, clean));
        }}
      />
      {inputs.length === 0 ? <p className={styles.note}>{t('builder.settings.noInputs')}</p> : null}
      {inputs.map((h) => (
        <div key={h} className={styles.field}>
          <span className={styles.fieldLabel}>{inputs.length > 1 ? `${t('builder.settings.inputFrom')} (${inputTitle(h).toLowerCase()})` : t('builder.settings.inputFrom')}</span>
          <Dropdown
            label={inputs.length > 1 ? `${t('builder.settings.inputFrom')}, ${inputTitle(h).toLowerCase()}` : t('builder.settings.inputFrom')}
            options={options}
            value={currentSource(definition, step.id, h)}
            disabled={readOnly}
            width="100%"
            onChange={(value) => {
              const r = setInput(definition, step.id, h, value);
              if (r.ok) {
                onChange(r.definition);
                setError(null);
              } else setError(r.reason);
            }}
          />
        </div>
      ))}
      {error ? <ErrorState what={t('builder.settings.connectFailed')} next={error} /> : null}
    </>
  );
}

function ConfigureTab({ step, definition, onChange, readOnly, context }: { step: FlowNode; definition: FlowDefinition; onChange: (d: FlowDefinition) => void; readOnly: boolean; context: FormContext }) {
  const Form = FORMS[step.type];
  return <Form key={step.id} step={step} definition={definition} readOnly={readOnly} context={context} onSettings={(settings) => onChange(updateSettings(definition, step.id, settings))} />;
}
