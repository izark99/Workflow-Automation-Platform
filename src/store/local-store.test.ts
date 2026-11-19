import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore, MemoryAdapter } from './local-store';
import { seedSnapshot } from './seed';
import { MAX_REF_ROWS, StoreError } from './types';

const NOW = new Date('2026-11-17T08:00:00.000Z');
let adapter: MemoryAdapter;
let store: LocalStore;
const as = async (id: string) => store.switchUser(id);
const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'ok', (e: unknown) => (e instanceof StoreError ? e.code : 'other'));

beforeEach(() => {
  adapter = new MemoryAdapter();
  store = new LocalStore({ adapter, seed: seedSnapshot, now: () => NOW });
});

describe('seed and persistence', () => {
  it('starts as the admin with the flows, groups and reference tables of the screens', async () => {
    expect((await store.currentUser()).role).toBe('admin');
    expect((await store.listFlows()).map((f) => f.name)).toEqual(['Monthly timesheet summary', 'Headcount report cleanup', 'OT by department', 'Insurance list merge']);
    expect((await store.listGroups()).map((g) => g.name)).toEqual(['HR Payroll', 'HR Analytics']);
    expect((await store.listRefTables()).map((t) => t.name)).toEqual(['Attendance codes', 'OT types', 'OT limits']);
  });
  it('keeps changes in the adapter and a new store reads them back', async () => {
    await store.createFlow({ name: 'Mine', scope: 'personal' });
    const again = new LocalStore({ adapter, seed: seedSnapshot, now: () => NOW });
    expect((await again.listFlows()).some((f) => f.name === 'Mine')).toBe(true);
  });
  it('returns copies, so a caller cannot change the store by editing a result', async () => {
    const [first] = await store.listFlows();
    first!.name = 'Changed';
    expect((await store.listFlows())[0]!.name).toBe('Monthly timesheet summary');
  });
  it('waits for the configured delay before it answers', async () => {
    const slow = new LocalStore({ adapter: new MemoryAdapter(), seed: seedSnapshot, delayMs: () => 60 });
    const t0 = Date.now();
    await slow.listFlows();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
  });
});

describe('permissions (SPEC section 7)', () => {
  it('a user sees own personal flows and the shared flows of their groups, never another user\'s personal flow', async () => {
    await as('user-minh');
    expect((await store.listFlows()).map((f) => f.id).sort()).toEqual(['flow-headcount', 'flow-insurance', 'flow-timesheet']);
    await as('user-lan');
    expect((await store.listFlows()).map((f) => f.id).sort()).toEqual(['flow-headcount', 'flow-timesheet']);
    expect(await code(store.getFlow('flow-insurance'))).toBe('not_found');
  });
  it('a user outside the group cannot see a shared flow', async () => {
    await store.setFlowGroups('flow-headcount', ['group-payroll']);
    await as('user-minh');
    expect(await code(store.getFlow('flow-headcount'))).toBe('not_found');
  });
  it('a group member can view and run a shared flow but not edit, delete or version it', async () => {
    await as('user-lan');
    expect((await store.getFlow('flow-timesheet')).name).toBe('Monthly timesheet summary');
    expect((await store.addRunLog({ flowId: 'flow-timesheet', versionNo: 3, effectiveDate: '2026-09-30', inputRows: 10, outputRows: 5, status: 'ok' })).userId).toBe('user-lan');
    expect(await code(store.deleteFlow('flow-timesheet'))).toBe('forbidden');
    expect(await code(store.saveFlowVersion('flow-timesheet', 4, { changeNote: 'x' }))).toBe('forbidden');
    expect(await code(store.createFlowVersion('flow-timesheet', { validFrom: '2027-06-01' }))).toBe('forbidden');
  });
  it('a user cannot create a shared flow; the admin can', async () => {
    await as('user-lan');
    expect(await code(store.createFlow({ name: 'S', scope: 'shared' }))).toBe('forbidden');
    await as('user-harold');
    expect(await code(store.createFlow({ name: 'S', scope: 'shared' }))).toBe('ok');
  });
  it('the owner has full rights on a personal flow and may delete it', async () => {
    await as('user-minh');
    expect(await code(store.saveFlowVersion('flow-insurance', 1, { changeNote: 'Edited' }))).toBe('ok');
    expect(await code(store.deleteFlow('flow-insurance'))).toBe('ok');
    expect(await code(store.getFlow('flow-insurance'))).toBe('not_found');
  });
  it('another user has no access to a personal flow, not even to delete it', async () => {
    await as('user-lan');
    expect(await code(store.deleteFlow('flow-ot-department'))).toBe('not_found');
  });
  it('a user can copy a shared flow into a personal flow, then edit the copy', async () => {
    await as('user-lan');
    const copy = await store.copyFlow('flow-timesheet', 'My timesheet');
    expect(copy.scope).toBe('personal');
    expect(copy.ownerId).toBe('user-lan');
    expect(copy.versions).toHaveLength(1);
    expect(await code(store.saveFlowVersion(copy.id, 1, { changeNote: 'Mine' }))).toBe('ok');
  });
  it('every user reads every reference table; only the admin changes them', async () => {
    await as('user-lan');
    expect((await store.listRefTables()).length).toBe(3);
    expect(await code(store.createRefTable({ name: 'New', description: '', columns: [] }))).toBe('forbidden');
    expect(await code(store.createRefTableVersion('ref-ot-limits', { validFrom: '2027-01-01' }))).toBe('forbidden');
  });
  it('users and groups are for the admin only', async () => {
    await as('user-lan');
    expect(await code(store.listUsers())).toBe('forbidden');
    expect(await code(store.listGroups())).toBe('forbidden');
    expect(await code(store.saveUser({ id: 'user-lan', name: 'Lan', email: 'l@x.com', role: 'admin', groupIds: [] }))).toBe('forbidden');
    expect(await code(store.setFlowGroups('flow-timesheet', []))).toBe('forbidden');
  });
});

describe('soft delete and restore', () => {
  it('a deleted flow is hidden from the list, kept, and restored by the admin', async () => {
    await store.deleteFlow('flow-headcount');
    expect((await store.listFlows()).some((f) => f.id === 'flow-headcount')).toBe(false);
    expect((await store.listDeletedFlows()).map((f) => f.id)).toContain('flow-headcount');
    await store.restoreFlow('flow-headcount');
    expect((await store.listFlows()).some((f) => f.id === 'flow-headcount')).toBe(true);
  });
  it('the seed has the two deleted flows of the admin screen', async () => {
    expect((await store.listDeletedFlows()).map((f) => f.name)).toEqual(['Payroll export check', 'Old headcount merge']);
  });
  it('only the admin restores or purges, and a normal user cannot see deleted flows', async () => {
    await as('user-lan');
    expect(await code(store.restoreFlow('flow-payroll-check'))).toBe('forbidden');
    expect(await code(store.listDeletedFlows())).toBe('forbidden');
    expect(await code(store.getFlow('flow-payroll-check'))).toBe('not_found');
  });
  it('purgeExpired removes flows deleted more than 30 days ago and keeps newer ones', async () => {
    const later = new LocalStore({ adapter: new MemoryAdapter(), seed: seedSnapshot, now: () => new Date('2026-11-30T00:00:00.000Z') });
    // Old headcount merge was deleted on 28 Oct (33 days before 30 Nov); Payroll export check on 5 Nov (25 days).
    expect(await later.purgeExpired()).toBe(1);
    expect((await later.listDeletedFlows()).map((f) => f.name)).toEqual(['Payroll export check']);
  });
  it('purgeFlow removes one deleted flow for good and refuses a live one', async () => {
    await store.purgeFlow('flow-payroll-check');
    expect((await store.listDeletedFlows()).map((f) => f.id)).not.toContain('flow-payroll-check');
    expect(await code(store.purgeFlow('flow-timesheet'))).toBe('not_found');
  });
});

describe('versions', () => {
  it('a published version is read-only; a new version is copied from it and starts as a draft', async () => {
    expect(await code(store.saveFlowVersion('flow-timesheet', 3, { changeNote: 'x' }))).toBe('conflict');
    const f = await store.createFlowVersion('flow-timesheet', { validFrom: '2027-06-01', copyFrom: 3, changeNote: 'Next' });
    const v5 = f.versions.find((v) => v.versionNo === 5)!;
    expect(v5.status).toBe('draft');
    expect(v5.definition).toEqual(f.versions.find((v) => v.versionNo === 3)!.definition);
  });
  it('publishing ends the previous open-ended version the day before (rule 6): v4 ends v3 on 31 Dec 2026', async () => {
    const f = await store.publishFlowVersion('flow-timesheet', 4);
    expect(f.versions.find((v) => v.versionNo === 3)!.validTo).toBe('2026-12-31');
    expect(f.versions.find((v) => v.versionNo === 4)!.status).toBe('published');
  });
  it('refuses a publish that would overlap, and changes nothing', async () => {
    await store.createFlowVersion('flow-timesheet', { validFrom: '2026-05-01', copyFrom: 3 });
    expect(await code(store.publishFlowVersion('flow-timesheet', 5))).toBe('conflict');
    const f = await store.getFlow('flow-timesheet');
    expect(f.versions.find((v) => v.versionNo === 5)!.status).toBe('draft');
    expect(f.versions.find((v) => v.versionNo === 2)!.validTo).toBe('2026-06-30');
  });
  it('checks dates: not a date, and end before start', async () => {
    expect(await code(store.createFlowVersion('flow-timesheet', { validFrom: '2027-02-30' }))).toBe('invalid');
    expect(await code(store.saveFlowVersion('flow-timesheet', 4, { validTo: '2026-12-31' }))).toBe('invalid');
  });
  it('a published version cannot be published twice', async () => {
    expect(await code(store.publishFlowVersion('flow-timesheet', 3))).toBe('conflict');
  });
  it('a new flow starts with one empty draft version', async () => {
    const f = await store.createFlow({ name: ' New flow ', scope: 'personal' });
    expect(f.name).toBe('New flow');
    expect(f.versions).toHaveLength(1);
    expect(f.versions[0]).toMatchObject({ versionNo: 1, status: 'draft', definition: { schemaVersion: 1, nodes: [], edges: [] } });
    expect(await code(store.createFlow({ name: '  ', scope: 'personal' }))).toBe('invalid');
  });
});

describe('reference table versions', () => {
  it('follows the same rules: copy to a new draft, edit, publish, previous version ends', async () => {
    const t = await store.createRefTableVersion('ref-attendance', { validFrom: '2027-01-01', copyFrom: 2 });
    const v3 = t.versions.find((v) => v.versionNo === 3)!;
    expect(v3.rows).toHaveLength(8);
    await store.saveRefTableVersion('ref-attendance', 3, { rows: [...v3.rows, ['X/3', 'Third day', 0.3, 'WORK', 'OT_DAY']] });
    const published = await store.publishRefTableVersion('ref-attendance', 3);
    expect(published.versions.find((v) => v.versionNo === 2)!.validTo).toBe('2026-12-31');
    expect(await code(store.saveRefTableVersion('ref-attendance', 3, { rows: [] }))).toBe('conflict');
  });
  it(`refuses more than ${MAX_REF_ROWS} rows and says how many were sent`, async () => {
    await store.createRefTableVersion('ref-ot-limits', { validFrom: '2027-01-01', copyFrom: 1 });
    const rows = Array.from({ length: MAX_REF_ROWS + 1 }, (_, i) => [`P${i}`, i]);
    await expect(store.saveRefTableVersion('ref-ot-limits', 2, { rows })).rejects.toThrow(/at most 50,000 rows.*50,001/);
    await store.saveRefTableVersion('ref-ot-limits', 2, { rows: rows.slice(0, MAX_REF_ROWS) });
  });
  it('creates a table with an empty draft and refuses a duplicate name', async () => {
    const t = await store.createRefTable({ name: 'Holidays', description: 'Public holidays', columns: [{ name: 'date', type: 'date' }] });
    expect(t.versions[0]).toMatchObject({ status: 'draft', rows: [] });
    expect(await code(store.createRefTable({ name: 'holidays', description: '', columns: [] }))).toBe('conflict');
  });
});

describe('groups and the last admin', () => {
  it('the admin creates, renames and deletes groups; a deleted group leaves users and flows', async () => {
    const g = await store.saveGroup({ name: ' HR Test ' });
    expect(g.name).toBe('HR Test');
    expect((await store.listGroups()).map((x) => x.name)).toContain('HR Test');
    await store.saveGroup({ id: g.id, name: 'HR Testing' });
    expect((await store.listGroups()).find((x) => x.id === g.id)!.name).toBe('HR Testing');
    await store.saveUser({ id: 'user-lan', name: 'Lan', email: 'lan@example.com', role: 'user', groupIds: ['group-payroll', g.id] });
    await store.setFlowGroups('flow-headcount', ['group-payroll', g.id]);
    await store.deleteGroup(g.id);
    expect((await store.listUsers()).find((u) => u.id === 'user-lan')!.groupIds).toEqual(['group-payroll']);
    expect((await store.getFlow('flow-headcount')).groupIds).toEqual(['group-payroll']);
    expect(await code(store.deleteGroup(g.id))).toBe('not_found');
  });
  it('refuses an empty name and a name that exists (ignoring case); only the admin changes groups', async () => {
    expect(await code(store.saveGroup({ name: '  ' }))).toBe('invalid');
    expect(await code(store.saveGroup({ name: 'hr payroll' }))).toBe('conflict');
    expect(await code(store.saveGroup({ id: 'group-analytics', name: 'HR PAYROLL' }))).toBe('conflict');
    expect(await code(store.saveGroup({ id: 'group-analytics', name: 'HR Analytics' }))).toBe('ok');
    await as('user-lan');
    expect(await code(store.saveGroup({ name: 'X' }))).toBe('forbidden');
    expect(await code(store.deleteGroup('group-payroll'))).toBe('forbidden');
  });
  it('the last admin cannot be made a user; with a second admin it can', async () => {
    const me = (await store.listUsers()).find((u) => u.id === 'user-harold')!;
    await expect(store.saveUser({ ...me, role: 'user' })).rejects.toThrow(/At least one admin is needed/);
    await store.saveUser({ id: 'user-lan', name: 'Lan', email: 'lan@example.com', role: 'admin', groupIds: ['group-payroll'] });
    expect(await code(store.saveUser({ ...me, role: 'user' }))).toBe('ok');
  });
  it('an email is used once (ignoring case), and unknown groups are dropped from a user', async () => {
    expect(await code(store.saveUser({ id: '', name: 'New', email: 'LAN@example.com', role: 'user', groupIds: [] }))).toBe('conflict');
    const u = await store.saveUser({ id: '', name: ' New ', email: ' new@example.com ', role: 'user', groupIds: ['group-payroll', 'group-nothing'] });
    expect(u).toMatchObject({ name: 'New', email: 'new@example.com', groupIds: ['group-payroll'] });
  });
});

describe('users, groups and run log', () => {
  it('the admin edits a user; a bad email is refused', async () => {
    await store.saveUser({ id: 'user-lan', name: 'Lan', email: 'lan@example.com', role: 'user', groupIds: ['group-payroll', 'group-analytics'] });
    expect((await store.listUsers()).find((u) => u.id === 'user-lan')!.groupIds).toHaveLength(2);
    expect(await code(store.saveUser({ id: 'user-lan', name: 'Lan', email: 'nope', role: 'user', groupIds: [] }))).toBe('invalid');
  });
  it('group access is only for a shared flow and only to real groups', async () => {
    const f = await store.setFlowGroups('flow-timesheet', ['group-payroll', 'group-unknown']);
    expect(f.groupIds).toEqual(['group-payroll']);
    expect(await code(store.setFlowGroups('flow-ot-department', ['group-payroll']))).toBe('invalid');
  });
  it('the run log keeps counts, not data, and is listed per flow', async () => {
    await store.addRunLog({ flowId: 'flow-timesheet', versionNo: 3, effectiveDate: '2026-09-30', inputRows: 120, outputRows: 33, status: 'ok' });
    const log = await store.listRunLog('flow-timesheet');
    expect(log).toHaveLength(1);
    expect(Object.keys(log[0]!).sort()).toEqual(['effectiveDate', 'flowId', 'id', 'inputRows', 'outputRows', 'runAt', 'status', 'userId', 'versionNo']);
    expect(await store.listRunLog('flow-headcount')).toEqual([]);
  });
});

describe('edited UI texts', () => {
  it('everyone reads them, an admin saves and resets them, a user cannot', async () => {
    expect(await store.listUiTexts()).toEqual([]);
    await store.saveUiTexts({ entries: [{ locale: 'vi', key: 'nav.flows', value: 'Quy trình' }], resets: [] });
    expect(await store.listUiTexts()).toMatchObject([{ locale: 'vi', key: 'nav.flows', value: 'Quy trình' }]);
    await store.saveUiTexts({ entries: [{ locale: 'vi', key: 'nav.flows', value: 'Luồng việc' }], resets: [] });
    expect((await store.listUiTexts()).map((t) => t.value)).toEqual(['Luồng việc']);
    await expect(store.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.flows', value: '   ' }], resets: [] })).rejects.toMatchObject({ messageId: 'errors.textEmpty' });
    await as('user-lan');
    expect((await store.listUiTexts()).map((t) => t.value)).toEqual(['Luồng việc']);
    expect(await code(store.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.flows', value: 'X' }], resets: [] }))).toBe('forbidden');
    expect(await code(store.saveUiTexts({ entries: [], resets: [{ locale: 'vi', key: 'nav.flows' }] }))).toBe('forbidden');
    await as('user-harold');
    await store.saveUiTexts({ entries: [], resets: [{ locale: 'vi', key: 'nav.flows' }] });
    expect(await store.listUiTexts()).toEqual([]);
  });
});

describe('saveUiTexts (both languages in one action)', () => {
  it('stores two languages and resets one in one call', async () => {
    await store.saveUiTexts({ entries: [{ locale: 'vi', key: 'nav.admin', value: 'Điều khiển' }], resets: [] });
    await store.saveUiTexts({
      entries: [
        { locale: 'en', key: 'nav.flows', value: 'Pipelines' },
        { locale: 'vi', key: 'nav.flows', value: 'Quy trình' },
      ],
      resets: [{ locale: 'vi', key: 'nav.admin' }],
    });
    const rows = await store.listUiTexts();
    expect(rows.map((t) => `${t.locale}:${t.key}=${t.value}`).sort()).toEqual(['en:nav.flows=Pipelines', 'vi:nav.flows=Quy trình']);
  });
  it('a bad entry changes nothing', async () => {
    await store.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.flows', value: 'Pipelines' }], resets: [] });
    const bad = (entries: { locale: 'en' | 'vi'; key: string; value: string }[]) => store.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.admin', value: 'Control' }, ...entries], resets: [{ locale: 'en', key: 'nav.flows' }] });
    await expect(bad([{ locale: 'vi', key: 'nav.flows', value: '  ' }])).rejects.toMatchObject({ messageId: 'errors.textEmpty' });
    await expect(bad([{ locale: 'fr' as 'en', key: 'nav.flows', value: 'X' }])).rejects.toMatchObject({ messageId: 'errors.textInvalid' });
    await expect(bad([{ locale: 'en', key: 'no key shape', value: 'X' }])).rejects.toMatchObject({ messageId: 'errors.textInvalid' });
    expect((await store.listUiTexts()).map((t) => `${t.key}=${t.value}`)).toEqual(['nav.flows=Pipelines']);
  });
  it('a user is refused', async () => {
    await as('user-lan');
    expect(await code(store.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.flows', value: 'X' }], resets: [] }))).toBe('forbidden');
    expect(await code(store.saveUiTexts({ entries: [], resets: [{ locale: 'en', key: 'nav.flows' }] }))).toBe('forbidden');
  });
});

describe('app settings', () => {
  it('has the default of 8 hours, and an admin changes it for everyone', async () => {
    expect(await store.getAppSettings()).toEqual({ idleTimeoutHours: 8 });
    expect(await store.saveAppSetting('idle_timeout_hours', 12)).toEqual({ idleTimeoutHours: 12 });
    await as('user-lan');
    expect(await store.getAppSettings()).toEqual({ idleTimeoutHours: 12 });
  });
  it('refuses a user, and a value that is not a whole number from 1 to 72', async () => {
    await as('user-lan');
    expect(await code(store.saveAppSetting('idle_timeout_hours', 5))).toBe('forbidden');
    await as('user-harold');
    for (const bad of [0, 73, 1.5, Number.NaN, -3]) await expect(store.saveAppSetting('idle_timeout_hours', bad)).rejects.toMatchObject({ messageId: 'errors.idleHoursInvalid' });
    for (const ok of [1, 72]) expect(await store.saveAppSetting('idle_timeout_hours', ok)).toEqual({ idleTimeoutHours: ok });
  });
});

describe('importRefTable', () => {
  const columns = [{ name: 'code', type: 'text' as const }, { name: 'limit', type: 'number' as const }];
  const rows = [['A', 1], ['B', 2]];
  it('a new table gets a draft with the columns and rows, and is not published', async () => {
    const { table, versionNo } = await store.importRefTable({ target: { kind: 'newTable', name: 'Imported', description: 'From a file' }, columns, rows });
    expect(versionNo).toBe(1);
    expect(table).toMatchObject({ name: 'Imported', description: 'From a file' });
    expect(table.versions[0]).toMatchObject({ status: 'draft', columns, rows });
    expect((await store.listRefTables()).find((t) => t.id === table.id)?.versions[0]?.status).toBe('draft');
  });
  it('a new version of a table is a draft that starts on the date given, and the old versions stay as they were', async () => {
    const before = (await store.listRefTables()).find((t) => t.id === 'ref-ot-limits')!;
    const { table, versionNo } = await store.importRefTable({ target: { kind: 'newVersion', tableId: 'ref-ot-limits', validFrom: '2027-01-01' }, columns, rows });
    expect(versionNo).toBe(before.versions.length + 1);
    expect(table.versions.find((v) => v.versionNo === versionNo)).toMatchObject({ status: 'draft', validFrom: '2027-01-01', columns, rows });
    expect(table.versions.filter((v) => v.versionNo !== versionNo)).toEqual(before.versions);
  });
  it('replaces the columns and rows of an existing draft, and keeps its dates', async () => {
    await store.createRefTableVersion('ref-ot-limits', { validFrom: '2027-01-01', copyFrom: 1 });
    const { table, versionNo } = await store.importRefTable({ target: { kind: 'replaceDraft', tableId: 'ref-ot-limits', versionNo: 2 }, columns, rows });
    expect(versionNo).toBe(2);
    expect(table.versions[1]).toMatchObject({ validFrom: '2027-01-01', status: 'draft', columns, rows });
  });
  it('refuses a published version, a missing table, a name that is taken, and a date that overlaps, and creates nothing', async () => {
    const count = async () => (await store.listRefTables()).reduce((n, t) => n + 1 + t.versions.length, 0);
    const n = await count();
    expect(await code(store.importRefTable({ target: { kind: 'replaceDraft', tableId: 'ref-ot-limits', versionNo: 1 }, columns, rows }))).toBe('conflict');
    expect(await code(store.importRefTable({ target: { kind: 'replaceDraft', tableId: 'nope', versionNo: 1 }, columns, rows }))).toBe('not_found');
    expect(await code(store.importRefTable({ target: { kind: 'newTable', name: 'ot limits', description: '' }, columns, rows }))).toBe('conflict');
    expect(await code(store.importRefTable({ target: { kind: 'newTable', name: '  ', description: '' }, columns, rows }))).toBe('invalid');
    expect(await code(store.importRefTable({ target: { kind: 'newVersion', tableId: 'ref-ot-limits', validFrom: 'not a date' }, columns, rows }))).toBe('invalid');
    expect(await count()).toBe(n);
  });
  it('refuses more than 50,000 rows and a shape that does not fit, before any write', async () => {
    const n = (await store.listRefTables()).length;
    const big = Array.from({ length: 50_001 }, (_, i) => ['k', i]);
    await expect(store.importRefTable({ target: { kind: 'newTable', name: 'Big', description: '' }, columns, rows: big })).rejects.toThrow(/at most 50,000 rows/);
    expect(await code(store.importRefTable({ target: { kind: 'newTable', name: 'Shape', description: '' }, columns, rows: [['only one']] }))).toBe('invalid');
    expect(await code(store.importRefTable({ target: { kind: 'newTable', name: 'Cols', description: '' }, columns: [{ name: ' ', type: 'text' }], rows: [['x']] }))).toBe('invalid');
    expect((await store.listRefTables()).length).toBe(n);
  });
  it('only the admin imports', async () => {
    await as('user-lan');
    expect(await code(store.importRefTable({ target: { kind: 'newTable', name: 'Nope', description: '' }, columns, rows }))).toBe('forbidden');
    expect(await code(store.importRefTable({ target: { kind: 'replaceDraft', tableId: 'ref-ot-limits', versionNo: 1 }, columns, rows }))).toBe('forbidden');
  });
});
