import { useState } from 'react';
import { Badge, Button, Card, Checkbox, DatePicker, Dialog, Dropdown, EmptyState, ErrorState, Field, InfoTip, PageHeader, ProgressBar, SearchField, SkeletonTable, Tabs, ToastProvider, useToast } from '../components';
import { useT } from '../i18n';
import styles from './dev-components.module.css';


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
            <Button variant="cta">{t('dev.demo.run')}</Button>
            <Button variant="primary">{t('dev.demo.newVersion')}</Button>
            <Button>{t('dev.demo.saveDraft')}</Button>
            <Button variant="danger">{t('dev.demo.deleteStep')}</Button>
            <Button disabled>{t('dev.demo.notAvailable')}</Button>
            <Button variant="primary" busy>{t('dev.demo.running')}</Button>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('dev.demo.compact36Px')}</span>
            <Button compact variant="primary">{t('dev.demo.run')}</Button>
            <Button compact>{t('dev.demo.open')}</Button>
            <Button compact variant="danger">{t('dev.demo.delete')}</Button>
            <Button compact disabled>{t('dev.demo.notAvailable')}</Button>
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
            <Button compact onClick={() => toast('Draft saved')}>{t('dev.demo.showToast')}</Button>
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
          <EmptyState title={t('dev.demo.noFlowsYet')} text={t('dev.demo.createYourFirstFlow')} action={<Button variant="primary">{t('dev.demo.createFlow')}</Button>} />
        </Card>
        <Card title={t('dev.progress')}>
          <ProgressBar value={7} max={12} label={t('dev.demo.runProgress')} />
          <div className={styles.split}>
            <span>
              <b>{t('dev.demo.step7Of12')}</b>{t('dev.demo.groupOtHours')}
            </span>
            <Button compact>{t('dev.demo.cancelRun')}</Button>
          </div>
        </Card>
        <Card title={t('dev.error')}>
          <ErrorState
            what={t('dev.demo.theTimesheetFileCould')}
            next={t('dev.demo.row3HasNo')}
            actions={
              <>
                <Button compact>{t('dev.demo.chooseAnotherFile')}</Button>
                <Button compact>{t('dev.demo.openTheStep')}</Button>
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
