import { useState } from 'react';
import { Badge, Button, Icon, Card, Checkbox, DatePicker, Dialog, Dropdown, EmptyState, ErrorState, Field, InfoTip, PageHeader, ProgressBar, SearchField, SkeletonTable, Tabs, ToastProvider, useToast } from '../components';
import { useT } from '../i18n';
import { ParameterControl } from '../builder/parameter-control/parameter-control';
import type { FlowParameter } from '../../engine/flow/parameters';
import type { BindableSetting } from '../../engine/flow/bindable';
import { PanelToggle } from '../panels/panel-toggle';
import panelStyles from '../panels/panel.module.css';
import styles from './dev-components.module.css';


function RailDemo({ id, initiallyCollapsed, label }: { id: string; initiallyCollapsed: boolean; label: string }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  return (
    <div className={`${panelStyles.panel} ${panelStyles.rail} ${panelStyles.left}`} id={id} data-demo-rail={id} style={{ width: collapsed ? 48 : 184, minHeight: 120 }}>
      <PanelToggle panel="steps" collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} controls={id} />
      {collapsed ? null : <span className={styles.note}>{label}</span>}
    </div>
  );
}

/** Every state of the parameter control (T6.11): a fixed value, no fitting parameter, bound, an error, a deleted parameter. */
function ParameterControlDemos() {
  const t = useT();
  const text: BindableSetting = { name: 'sheet', type: 'text', optional: true, placeholder: t('dev.demo.pcSheet') };
  const params: FlowParameter[] = [{ key: 'period', label: t('dev.demo.pcPeriod'), type: 'text', required: true }, { key: 'header', label: t('dev.demo.pcHeader'), type: 'number', required: false }];
  const [fixed, setFixed] = useState('Sheet1');
  const field = (value: string, readOnly = false) => <Field label={t('dev.demo.pcSheet')} value={value} disabled={readOnly} onChange={(e) => setFixed(e.target.value)} />;
  const base = { field: t('dev.demo.pcSheet'), setting: text, parameters: params, onBind: () => undefined, onUnbind: () => undefined };
  const bound = { $param: 'period' };
  return (
    <div className={styles.pcGrid}>
      <div data-demo="pcFixed">
        <span className={styles.rowLabel}>{t('dev.demo.pcFixed')}</span>
        <ParameterControl {...base} value={fixed} readOnly={false}>{field(fixed)}</ParameterControl>
      </div>
      <div data-demo="pcNoFit">
        <span className={styles.rowLabel}>{t('dev.demo.pcNoFit')}</span>
        <ParameterControl {...base} parameters={[params[1]!]} value="Sheet1" readOnly={false}>{field('Sheet1')}</ParameterControl>
      </div>
      <div data-demo="pcReadOnly">
        <span className={styles.rowLabel}>{t('dev.demo.pcReadOnly')}</span>
        <ParameterControl {...base} value="Sheet1" readOnly>{field('Sheet1', true)}</ParameterControl>
      </div>
      <div data-demo="pcBound">
        <span className={styles.rowLabel}>{t('dev.demo.pcBound')}</span>
        <ParameterControl {...base} value={bound} readOnly={false} now={{ type: 'text', value: 'July' }}>{field('')}</ParameterControl>
      </div>
      <div data-demo="pcError">
        <span className={styles.rowLabel}>{t('dev.demo.pcError')}</span>
        <ParameterControl {...base} value={bound} readOnly={false} error={t('dev.demo.pcErrorText')}>{field('')}</ParameterControl>
      </div>
      <div data-demo="pcGone">
        <span className={styles.rowLabel}>{t('dev.demo.pcGone')}</span>
        <ParameterControl {...base} value={{ $param: 'old_period' }} readOnly={false}>{field('')}</ParameterControl>
      </div>
      <div data-demo="pcBoundReadOnly">
        <span className={styles.rowLabel}>{t('dev.demo.pcBoundReadOnly')}</span>
        <ParameterControl {...base} value={bound} readOnly now={{ type: 'text', value: 'July' }}>{field('', true)}</ParameterControl>
      </div>
      <div style={{ minHeight: 140 }} data-demo="pcOpen">
        <span className={styles.rowLabel}>{t('dev.demo.pcOpen')}</span>
        <ParameterControl {...base} value="Sheet1" readOnly={false} defaultOpen>{field('Sheet1')}</ParameterControl>
      </div>
    </div>
  );
}

function Content() {
  const t = useT();
  const VERSIONS = [
    { value: 'v3', label: t('common.version.from', { n: 3, from: '01 Jul 2026' }) },
    { value: 'v2', label: t('common.version.range', { n: 2, from: '01 Apr 2026', to: '30 Jun 2026' }) },
    { value: 'v1', label: t('common.version.range', { n: 1, from: '01 Jan 2026', to: '31 Mar 2026' }) },
  ];
  const [version, setVersion] = useState('v3');
  const [date, setDate] = useState('2026-09-30');
  const [checked, setChecked] = useState(true);
  const [tab, setTab] = useState('setup');
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  return (
    <main className={styles.main}>
      <PageHeader breadcrumb={<span>{t('dev.crumb')}</span>} title={t('dev.title')} subtitle={t('dev.subtitle')} />
      <div className={styles.grid} data-first-block>
        <Card title={t('dev.buttons')}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('dev.demo.default40Px')}</span>
            <Button variant="primary">{t('dev.demo.run')}</Button>
            <Button>{t('dev.demo.newVersion')}</Button>
            <Button>{t('dev.demo.saveDraft')}</Button>
            <Button variant="danger">{t('dev.demo.deleteStep')}</Button>
            <Button disabled>{t('dev.demo.notAvailable')}</Button>
            <Button busy>{t('dev.demo.running')}</Button>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('dev.demo.compact36Px')}</span>
            <Button size="sm">{t('dev.demo.run')}</Button>
            <Button size="sm">{t('dev.demo.open')}</Button>
            <Button size="sm" variant="danger">{t('dev.demo.delete')}</Button>
            <Button size="sm" disabled>{t('dev.demo.notAvailable')}</Button>
            <Button icon variant="ghost" aria-label={t('dev.demo.delete')}>
              <Icon name="x" />
            </Button>
          </div>
          <p className={styles.note}>{t('dev.buttonsNote')}</p>
        </Card>
        <Card title={t('dev.fields')}>
          <div className={styles.row} style={{ gap: 24, alignItems: 'flex-end' }}>
            <div style={{ width: 240 }}>
              <Field label={t('dev.demo.newColumnName')} defaultValue="OT flag" />
            </div>
            <SearchField label={t('dev.demo.searchFlows')} placeholder={t('dev.demo.flowName')} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('dev.demo.checkbox')}</span>
            <Checkbox checked={checked} onChange={setChecked}>{t('dev.demo.viewAndRun')}</Checkbox>
            <Checkbox checked={false} onChange={() => undefined}>{t('dev.demo.viewAndRun')}</Checkbox>
            <Checkbox checked={false} disabled onChange={() => undefined}>{t('dev.demo.notAvailable')}</Checkbox>
          </div>
          <Tabs label={t('dev.demo.stepSettings')} tabs={[{ id: 'setup', label: t('dev.demo.setup') }, { id: 'configure', label: t('dev.demo.configure') }, { id: 'test', label: t('dev.demo.test') }]} selected={tab} onSelect={setTab}>
            <p className={styles.note}>{t('dev.demo.selectedTab')}{' '}<span data-code>{tab}</span></p>
          </Tabs>
          <div className={styles.row}>
            <Badge>{t('dev.demo.published')}</Badge>
            <Badge tone="outline">{t('dev.demo.shared')}</Badge>
            <Button size="sm" onClick={() => toast('Draft saved')}>{t('dev.demo.showToast')}</Button>
          </div>
        </Card>
        <div className={styles.mid} style={{ display: 'contents' }}>
          <Card title={t('dev.dropdown')}>
            <div className={styles.popovers} style={{ minHeight: 190 }}>
              <Dropdown label={t('dev.demo.version')} options={VERSIONS} value={version} onChange={setVersion} />
              <Dropdown label={t('dev.demo.openVersionList')} options={VERSIONS} value="v3" onChange={() => undefined} defaultOpen />
            </div>
          </Card>
        </div>
        <Card title={t('dev.demo.infoButton')}>
          <div className={styles.popovers} style={{ minHeight: 120 }}>
            <span>
              {t('dev.demo.effectiveDate')}
              <InfoTip label={t('dev.demo.effectiveDate')}>{t('dev.demo.theDateARun')}</InfoTip>
            </span>
            <span>
              {t('dev.demo.openInfoButton')}
              <InfoTip label={t('dev.demo.openInfoButton')} defaultOpen>
                {t('dev.demo.opensOnClickEnter')}
              </InfoTip>
            </span>
          </div>
        </Card>
        <Card title={t('dev.datePicker')}>
          <div className={styles.popovers} style={{ minHeight: 360 }}>
            <DatePicker label={t('dev.demo.effectiveDate')} value={date} onChange={setDate} />
            <DatePicker label={t('dev.demo.openDatePicker')} value="2026-09-30" onChange={() => undefined} defaultOpen />
          </div>
        </Card>
        <Card title={t('dev.loading')}>
          <div className={styles.skeleton}>
            <SkeletonTable weights={[30, 16, 8, 14, 14, 18]} rows={3} label={t('dev.demo.loadingFlows')} />
          </div>
          <p className={styles.note}>{t('dev.loadingNote')}</p>
        </Card>
        <Card title={t('dev.empty')}>
          <EmptyState title={t('dev.demo.noFlowsYet')} text={t('dev.demo.createYourFirstFlow')} action={<Button>{t('dev.demo.createFlow')}</Button>} />
        </Card>
        <Card title={t('dev.panels')}>
          <div className={styles.row} style={{ alignItems: 'flex-start', gap: 24 }}>
            <RailDemo id="demo-rail-open" initiallyCollapsed={false} label={t('dev.demo.panelOpen')} />
            <RailDemo id="demo-rail-collapsed" initiallyCollapsed label={t('dev.demo.panelCollapsed')} />
          </div>
        </Card>
        <Card title={t('dev.parameterControl')}>
          <ParameterControlDemos />
        </Card>
        <Card title={t('dev.progress')}>
          <ProgressBar value={7} max={12} label={t('dev.demo.runProgress')} />
          <div className={styles.split}>
            <span>
              <b>{t('dev.demo.step7Of12')}</b>{t('dev.demo.groupOtHours')}
            </span>
            <Button size="sm">{t('dev.demo.cancelRun')}</Button>
          </div>
        </Card>
        <Card title={t('dev.error')}>
          <ErrorState
            what={t('dev.demo.theTimesheetFileCould')}
            next={t('dev.demo.row3HasNo')}
            actions={
              <>
                <Button size="sm">{t('dev.demo.chooseAnotherFile')}</Button>
                <Button size="sm">{t('dev.demo.openTheStep')}</Button>
              </>
            }
          />
        </Card>
        <Card title={t('dev.confirm')}>
          <div className={styles.row}>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              {t('dev.demo.deleteFlow')}
            </Button>
          </div>
        </Card>
      </div>
      {confirm ? (
        <Dialog
          title={t('dev.demo.deleteMonthlyTimesheetSummary')}
          onClose={() => setConfirm(false)}
          actions={
            <>
              <Button onClick={() => setConfirm(false)}>{t('dev.demo.cancel')}</Button>
              <Button variant="danger" onClick={() => setConfirm(false)}>
                {t('dev.demo.deleteFlow')}
              </Button>
            </>
          }
        >
          {t('dev.demo.theFlowAndIts')}
        </Dialog>
      ) : null}
    </main>
  );
}

export function DevComponents() {
  return (
    <ToastProvider>
      <Content />
    </ToastProvider>
  );
}
