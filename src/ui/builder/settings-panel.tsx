import { useState } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import { NODE_PORTS } from '../../engine/flow/types';
import type { RefTable } from '../../engine/versions';
import { Button, Dropdown, ErrorState, Field, Tabs } from '../components';
import { settingsStrings as t } from '../strings';
import { currentSource, deleteSteps, inputHandlesOf, inputTitle, renameStep, setInput, sourceOptions, STEP_CATALOG, stepNumbers } from './graph';
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
}

/** The 380 px panel at the right: the selected step with the tabs Setup, Configure and Test. */
export function SettingsPanel({ definition, step, onChange, onDeleted, readOnly, testFiles, onTestFile, refTables }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('setup');
  const [error, setError] = useState<string | null>(null);

  if (!step) {
    return (
      <aside aria-label={t.panel} className={styles.panel}>
        <p className={styles.hint}>{t.none}</p>
      </aside>
    );
  }
  const number = stepNumbers(definition).get(step.id) ?? 0;
  const label = step.label ?? step.id;

  return (
    <aside aria-label={t.panel} className={styles.panel}>
      <div className={styles.head}>
        <h2>{`${number}. ${label}`}</h2>
        <p className={styles.hint}>{STEP_CATALOG[step.type].label}. {STEP_CATALOG[step.type].hint}</p>
      </div>
      <Tabs
        label={t.tabsLabel}
        tabs={[
          { id: 'setup', label: t.tabs.setup },
          { id: 'configure', label: t.tabs.configure },
          { id: 'test', label: t.tabs.test },
        ]}
        selected={tab}
        onSelect={(id) => setTab(id as SettingsTab)}
      >
        <div className={styles.stack}>
          {readOnly ? <p className={styles.hint}>{t.readOnly}</p> : null}
          {tab === 'setup' ? (
            <SetupTab key={step.id} definition={definition} step={step} onChange={onChange} readOnly={readOnly} error={error} setError={setError} />
          ) : null}
          {tab === 'configure' ? <p className={styles.hint}>{t.noForm}</p> : null}
          {tab === 'test' ? <StepPreview key={step.id} definition={definition} step={step} files={testFiles} onFile={onTestFile} refTables={refTables} /> : null}
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
          {t.deleteStep}
        </Button>
      </div>
    </aside>
  );
}

function SetupTab({ definition, step, onChange, readOnly, error, setError }: { definition: FlowDefinition; step: FlowNode } & Pick<SettingsPanelProps, 'onChange' | 'readOnly'> & { error: string | null; setError: (e: string | null) => void }) {
  const [name, setName] = useState(step.label ?? step.id);
  const [nameError, setNameError] = useState(false);
  const ports = NODE_PORTS[step.type].inputs;
  const inputs = ports.kind === 'fixed' && ports.handles.length === 0 ? [] : inputHandlesOf(definition, step);
  const options = sourceOptions(definition, step.id);

  return (
    <>
      <Field
        label={t.stepName}
        hint={t.stepNameHint}
        value={name}
        disabled={readOnly}
        error={nameError ? `${t.emptyStepName} ${t.emptyStepNameNext}` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          const clean = e.target.value.trim();
          setNameError(clean === '');
          if (clean !== '') onChange(renameStep(definition, step.id, clean));
        }}
      />
      {inputs.length === 0 ? <p className={styles.hint}>{t.noInputs}</p> : null}
      {inputs.map((h) => (
        <div key={h} className={styles.field}>
          <span className={styles.fieldLabel}>{inputs.length > 1 ? `${t.inputFrom} (${inputTitle(h).toLowerCase()})` : t.inputFrom}</span>
          <Dropdown
            label={inputs.length > 1 ? `${t.inputFrom}, ${inputTitle(h).toLowerCase()}` : t.inputFrom}
            options={options}
            value={currentSource(definition, step.id, h)}
            disabled={readOnly}
            width={338}
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
      {error ? <ErrorState what={t.connectFailed} next={error} /> : null}
    </>
  );
}
