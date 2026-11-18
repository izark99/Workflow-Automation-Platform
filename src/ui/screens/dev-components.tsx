import { useState } from 'react';
import { Badge, Button, Card, Checkbox, DatePicker, Dialog, Dropdown, EmptyState, ErrorState, Field, InfoTip, PageHeader, ProgressBar, SearchField, SkeletonTable, Tabs, ToastProvider, useToast } from '../components';
import { devStrings as t } from '../strings';
import styles from './dev-components.module.css';

const VERSIONS = [
  { value: 'v3', label: 'v3, from 01 Jul 2026' },
  { value: 'v2', label: 'v2, 01 Apr 2026 to 30 Jun 2026' },
  { value: 'v1', label: 'v1, 01 Jan 2026 to 31 Mar 2026' },
];

function Content() {
  const [version, setVersion] = useState('v3');
  const [date, setDate] = useState('2026-09-30');
  const [checked, setChecked] = useState(true);
  const [tab, setTab] = useState('setup');
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  return (
    <main className={styles.main}>
      <PageHeader breadcrumb={<span>{t.crumb}</span>} title={t.title} subtitle={t.subtitle} />
      <div className={styles.grid} data-first-block>
        <Card title={t.buttons}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Default, 40 px</span>
            <Button variant="cta">Run</Button>
            <Button variant="primary">New version</Button>
            <Button>Save draft</Button>
            <Button variant="danger">Delete step</Button>
            <Button disabled>Not available</Button>
            <Button variant="primary" busy>Running</Button>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Compact, 36 px</span>
            <Button compact variant="primary">Run</Button>
            <Button compact>Open</Button>
            <Button compact variant="danger">Delete</Button>
            <Button compact disabled>Not available</Button>
          </div>
          <p className={styles.note}>{t.buttonsNote}</p>
        </Card>
        <Card title={t.fields}>
          <div className={styles.row} style={{ gap: 24, alignItems: 'flex-end' }}>
            <div style={{ width: 240 }}>
              <Field label="New column name" defaultValue="OT flag" />
            </div>
            <SearchField label="Search flows" placeholder="Flow name" />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Checkbox</span>
            <Checkbox checked={checked} onChange={setChecked}>View and run</Checkbox>
            <Checkbox checked={false} onChange={() => undefined}>View and run</Checkbox>
            <Checkbox checked={false} disabled onChange={() => undefined}>Not available</Checkbox>
          </div>
          <Tabs label="Step settings" tabs={[{ id: 'setup', label: 'Setup' }, { id: 'configure', label: 'Configure' }, { id: 'test', label: 'Test' }]} selected={tab} onSelect={setTab}>
            <p className={styles.note}>Selected tab: {tab}</p>
          </Tabs>
          <div className={styles.row}>
            <Badge>Published</Badge>
            <Badge tone="outline">Shared</Badge>
            <Button compact onClick={() => toast('Draft saved')}>Show toast</Button>
          </div>
        </Card>
        <div className={styles.mid} style={{ display: 'contents' }}>
          <Card title={t.dropdown}>
            <div className={styles.popovers} style={{ minHeight: 190 }}>
              <Dropdown label="Version" options={VERSIONS} value={version} onChange={setVersion} />
              <Dropdown label="Open version list" options={VERSIONS} value="v3" onChange={() => undefined} defaultOpen />
            </div>
          </Card>
        </div>
        <Card title="Info button">
          <div className={styles.popovers} style={{ minHeight: 120 }}>
            <span>
              Effective date
              <InfoTip label="Effective date">The date a run is for. The flow version and the reference table versions valid on this date are used.</InfoTip>
            </span>
            <span>
              Open info button
              <InfoTip label="Open info button" defaultOpen>
                Opens on click, Enter or Space. Escape or a click outside closes it.
              </InfoTip>
            </span>
          </div>
        </Card>
        <Card title={t.datePicker}>
          <div className={styles.popovers} style={{ minHeight: 360 }}>
            <DatePicker label="Effective date" value={date} onChange={setDate} />
            <DatePicker label="Open date picker" value="2026-09-30" onChange={() => undefined} defaultOpen />
          </div>
        </Card>
        <Card title={t.loading}>
          <div className={styles.skeleton}>
            <SkeletonTable weights={[30, 16, 8, 14, 14, 18]} rows={3} label="Loading flows" />
          </div>
          <p className={styles.note}>{t.loadingNote}</p>
        </Card>
        <Card title={t.empty}>
          <EmptyState title="No flows yet" text="Create your first flow, or ask the admin to share one with your group." action={<Button variant="primary">Create flow</Button>} />
        </Card>
        <Card title={t.progress}>
          <ProgressBar value={7} max={12} label="Run progress" />
          <div className={styles.split}>
            <span>
              <b>Step 7 of 12</b>: Group OT hours
            </span>
            <Button compact>Cancel run</Button>
          </div>
        </Card>
        <Card title={t.error}>
          <ErrorState
            what="The timesheet file could not be read."
            next="Row 3 has no header named Employee ID. Check the header row in the Input file step, or choose another file."
            actions={
              <>
                <Button compact>Choose another file</Button>
                <Button compact>Open the step</Button>
              </>
            }
          />
        </Card>
        <Card title={t.confirm}>
          <div className={styles.row}>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Delete flow
            </Button>
          </div>
        </Card>
      </div>
      {confirm ? (
        <Dialog
          title="Delete Monthly timesheet summary?"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <Button onClick={() => setConfirm(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => setConfirm(false)}>
                Delete flow
              </Button>
            </>
          }
        >
          The flow and its 4 versions move to Deleted flows. The admin can restore it within 30 days.
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
