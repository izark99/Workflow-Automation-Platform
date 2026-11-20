import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FlowDefinition, FlowNode } from '../../engine/flow/types';
import { NODE_PORTS } from '../../engine/flow/types';
import { withBindingsVersion } from '../../engine/flow/bindings';
import { parametersOf } from '../../engine/flow/parameters';
import type { ParameterValue } from '../../engine/flow/parameters';
import type { RefTable } from '../../engine/versions';
import { Button, Dropdown, ErrorState, Field, InfoTip, Tabs } from '../components';
import { useT } from '../i18n';
import { currentSource, deleteSteps, updateSettings, inputHandlesOf, inputTitle, renameStep, setInput, sourceOptions, STEP_CATALOG, stepNumbers } from './graph';
import { FORMS } from './forms';
import type { FormContext } from './forms/types';
import { BindingScopeProvider } from './parameter-control/bind';
import { boundNames, hiddenFromForm, putBindingsBack } from './parameter-control/bindings-edit';
import { ParametersPanel } from './parameters-panel';
import { StepPreview } from './step-preview';
import { usePanel } from '../panels/use-panel';
import { PanelToggle } from '../panels/panel-toggle';
import { countRender } from './render-counter';
import styles from './settings-panel.module.css';

/** The settings panel frame: 380 px open, a 48 px rail when collapsed (toggle and, for a selected step, its name upright). */
function PanelFrame({ stepName, children }: { stepName?: string; children: ReactNode }) {
  const t = useT();
  const { collapsed, toggle } = usePanel('settings');
  return (
    <aside id="builder-settings" aria-label={t('builder.settings.panel')} className={`${styles.panel} ${collapsed ? styles.rail : ''}`}>
      <div className={styles.toggle}>
        <PanelToggle panel="settings" collapsed={collapsed} onToggle={toggle} controls="builder-settings" />
      </div>
      {collapsed && stepName ? (
        <span className={styles.railName} title={stepName} data-user-content>
          {stepName}
        </span>
      ) : null}
      <div className={styles.content} hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}

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
  /** The test date, shared by the Test tab and the forms that show what a table version is used on that day. */
  testDate: string;
  onTestDate: (date: string) => void;
  /** The range of the open version and whether tables with no version are left out of the date check. */
  coverage?: FormContext['coverage'];
}

/** The 380 px panel at the right: the selected step with the tabs Setup, Configure and Test. */
export function SettingsPanel({ definition, step, onChange, onDeleted, readOnly, testFiles, onTestFile, refTables, parameterValues, onParameterValue, testDate, onTestDate, coverage }: SettingsPanelProps) {
  countRender('SettingsPanel');
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>('setup');
  const [error, setError] = useState<string | null>(null);

  if (!step) {
    return (
      <PanelFrame>
        <ParametersPanel definition={definition} onChange={onChange} readOnly={readOnly} />
        <p className={styles.note}>{t('builder.settings.none')}</p>
      </PanelFrame>
    );
  }
  const number = stepNumbers(definition).get(step.id) ?? 0;
  const label = step.label ?? step.id;

  return (
    <PanelFrame stepName={`${number}. ${label}`}>
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
          {tab === 'configure' ? <ConfigureTab step={step} definition={definition} onChange={onChange} readOnly={readOnly} context={{ testFiles, refTables, parameterValues, testDate, coverage }} /> : null}
          {tab === 'test' ? <StepPreview key={step.id} definition={definition} step={step} files={testFiles} onFile={onTestFile} refTables={refTables} parameterValues={parameterValues} onParameterValue={onParameterValue} date={testDate} onDate={onTestDate} onApplySettings={(next) => { onChange(withBindingsVersion(updateSettings(definition, step.id, next))); setTab('configure'); }} /> : null}
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
    </PanelFrame>
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
  const lastFixed = useRef<Record<string, unknown>>({});
  // The form knows plain values only: it is shown a placeholder where a setting is bound, and the bindings are put back when
  // it saves. The first binding makes the definition schemaVersion 3 (SPEC 13.3).
  const apply = (settings: Record<string, unknown>): void => onChange(withBindingsVersion(updateSettings(definition, step.id, settings)));
  const shown = { ...step, settings: hiddenFromForm(step.type, step.settings) };
  const bound = boundNames(step.settings).join(',');
  return (
    <BindingScopeProvider value={{ step, parameters: parametersOf(definition), readOnly, apply, remember: (memory, value) => { lastFixed.current[memory] = value; }, recall: (memory) => lastFixed.current[memory] }}>
      <Form key={`${step.id}|${bound}`} step={shown} definition={definition} readOnly={readOnly} context={context} onSettings={(settings) => apply(putBindingsBack(settings, step.settings))} />
    </BindingScopeProvider>
  );
}
