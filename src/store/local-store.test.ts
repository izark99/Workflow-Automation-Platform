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

describe('updateRefTable', () => {
  it('the admin changes the description, the name stays, and a user is refused', async () => {
    const t = await store.updateRefTable('ref-ot-limits', { description: 'Hours per period' });
    expect(t).toMatchObject({ id: 'ref-ot-limits', name: 'OT limits', description: 'Hours per period' });
    expect((await store.listRefTables()).find((x) => x.id === 'ref-ot-limits')?.description).toBe('Hours per period');
    expect(await code(store.updateRefTable('nope', { description: 'x' }))).toBe('not_found');
    await as('user-lan');
    expect(await code(store.updateRefTable('ref-ot-limits', { description: 'Hacked' }))).toBe('forbidden');
  });
});

describe('listRefTables: rows only where a flow reads the table (SPEC 12.1)', () => {
  const reads = (table: string) => ({ schemaVersion: 1, nodes: [{ id: 'l1', type: 'lookup_join', settings: { source: { kind: 'reference', table } } }], edges: [] });
  const rowsOf = async (name: string) => (await store.listRefTables()).find((t) => t.name === name)!;

  it('the admin reads every version of every table', async () => {
    for (const t of await store.listRefTables()) expect(t.versions.length, t.name).toBeGreaterThan(0);
  });
  it('a user with no flow that reads a table sees its name and description, but no version', async () => {
    await as('user-lan');
    const all = await store.listRefTables();
    expect(all.map((t) => t.name)).toEqual(['Attendance codes', 'OT types', 'OT limits']);
    for (const t of all) {
      expect(t.versions, t.name).toEqual([]);
      expect(t.usedBy.length, t.name).toBe(0);
    }
  });
  it('a personal flow gives its owner the rows of the table it reads, a draft version counts, and the usedBy names it', async () => {
    await as('user-lan');
    const flow = await store.createFlow({ name: 'Lan flow', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: reads('OT types') });
    const t = await rowsOf('OT types');
    expect(t.usedBy).toEqual(['Lan flow']);
    expect(t.versions.length).toBeGreaterThan(0);
    expect((await rowsOf('OT limits')).versions).toEqual([]);
    await as('user-minh');
    expect((await rowsOf('OT types')).versions).toEqual([]); // another person's personal flow gives nothing
    expect((await rowsOf('OT types')).usedBy).toEqual([]);
  });
  it('a shared flow gives the rows to the members of its groups only', async () => {
    const flow = await store.createFlow({ name: 'Shared reader', scope: 'shared' });
    await store.saveFlowVersion(flow.id, 1, { definition: reads('OT limits') });
    await store.setFlowGroups(flow.id, ['group-payroll']);
    await as('user-lan'); // in HR Payroll
    expect((await rowsOf('OT limits')).usedBy).toEqual(['Shared reader']);
    expect((await rowsOf('OT limits')).versions.length).toBeGreaterThan(0);
    await as('user-minh'); // in HR Analytics only
    expect((await rowsOf('OT limits')).versions).toEqual([]);
  });
  it('a deleted flow gives no access, and restoring it gives it back', async () => {
    await as('user-lan');
    const flow = await store.createFlow({ name: 'Short lived', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: reads('Attendance codes') });
    expect((await rowsOf('Attendance codes')).versions.length).toBeGreaterThan(0);
    await store.deleteFlow(flow.id);
    expect((await rowsOf('Attendance codes')).versions).toEqual([]);
    await as('user-harold');
    expect((await rowsOf('Attendance codes')).usedBy).not.toContain('Short lived');
    await store.restoreFlow(flow.id);
    await as('user-lan');
    expect((await rowsOf('Attendance codes')).versions.length).toBeGreaterThan(0);
  });
  it('editing the definition so that it no longer reads the table takes the access away', async () => {
    await as('user-lan');
    const flow = await store.createFlow({ name: 'Changing', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: reads('OT types') });
    await store.saveFlowVersion(flow.id, 1, { definition: { schemaVersion: 1, nodes: [], edges: [] } });
    expect((await rowsOf('OT types')).versions).toEqual([]);
  });
  it('lists each flow once per table even when several of its versions read the table', async () => {
    const flow = await store.createFlow({ name: 'Two versions', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: reads('OT types') });
    expect((await rowsOf('OT types')).usedBy.filter((n) => n === 'Two versions')).toHaveLength(1);
  });
});

describe('deleting a reference table (admin only)', () => {
  const lookupFlowOn = (table: string) => ({
    schemaVersion: 1,
    nodes: [{ id: 'in', type: 'input_file', settings: { key: 'Data' } }, { id: 'out', type: 'reference_table', settings: { table } }],
    edges: [],
  });

  it('removes a table that no flow reads, with its versions', async () => {
    const made = await store.createRefTable({ name: 'Temp', description: '', columns: [{ name: 'id', type: 'text' }] });
    await store.deleteRefTable(made.id);
    expect((await store.listRefTables()).some((t) => t.id === made.id)).toBe(false);
    expect(await code(store.deleteRefTable(made.id))).toBe('not_found');
  });

  it('refuses a table that a live flow reads, and the message names the flows', async () => {
    const made = await store.createRefTable({ name: 'Temp', description: '', columns: [] });
    const flow = await store.createFlow({ name: 'Zeta reader', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: lookupFlowOn('Temp') });
    const other = await store.createFlow({ name: 'Alpha reader', scope: 'personal' });
    await store.saveFlowVersion(other.id, 1, { definition: lookupFlowOn('Temp') });
    await expect(store.deleteRefTable(made.id)).rejects.toThrow('The reference table "Temp" is read by Alpha reader, Zeta reader. Remove it from those flows first, then delete it.');
    expect(await code(store.deleteRefTable(made.id))).toBe('conflict');
    expect((await store.listRefTables()).some((t) => t.id === made.id)).toBe(true);
  });

  it('lets a table go when the only flow that read it is deleted, or no longer reads it', async () => {
    const made = await store.createRefTable({ name: 'Temp', description: '', columns: [] });
    const flow = await store.createFlow({ name: 'Reader', scope: 'personal' });
    await store.saveFlowVersion(flow.id, 1, { definition: lookupFlowOn('Temp') });
    await store.saveFlowVersion(flow.id, 1, { definition: { schemaVersion: 1, nodes: [], edges: [] } });
    await store.deleteRefTable(made.id);
    const again = await store.createRefTable({ name: 'Temp2', description: '', columns: [] });
    await store.saveFlowVersion(flow.id, 1, { definition: lookupFlowOn('Temp2') });
    await store.deleteFlow(flow.id);
    await store.deleteRefTable(again.id);
    expect((await store.listRefTables()).some((t) => t.name.startsWith('Temp'))).toBe(false);
  });

  it('is for the admin only', async () => {
    const made = await store.createRefTable({ name: 'Temp', description: '', columns: [] });
    await as('user-lan');
    expect(await code(store.deleteRefTable(made.id))).toBe('forbidden');
    await as('user-harold');
    expect((await store.listRefTables()).some((t) => t.id === made.id)).toBe(true);
  });
});

describe('the number of flows of a user (set by the admin)', () => {
  const setLimit = async (id: string, maxFlows: number | null) => {
    const user = (await store.listUsers()).find((u) => u.id === id)!;
    await store.saveUser({ ...user, maxFlows });
  };

  it('refuses a new flow and a copy when a user owns as many flows as the limit, with the words of the app', async () => {
    const lan = (await store.listUsers()).find((u) => u.id === 'user-lan')!;
    await as('user-harold');
    await setLimit('user-lan', 2);
    await as('user-lan');
    const before = (await store.listFlows()).filter((f) => f.ownerId === lan.id).length;
    const room = Math.max(0, 2 - before);
    for (let i = 0; i < room; i += 1) await store.createFlow({ name: `Mine ${i}`, scope: 'personal' });
    await expect(store.createFlow({ name: 'One too many', scope: 'personal' })).rejects.toThrow('You have reached the limit of 2 flows that the admin set for you. Delete a flow, or ask the admin to raise the limit.');
    expect(await code(store.createFlow({ name: 'One too many', scope: 'personal' }))).toBe('conflict');
    const shared = (await store.listFlows()).find((f) => f.scope === 'shared')!;
    expect(await code(store.copyFlow(shared.id, 'My copy'))).toBe('conflict');
  });

  it('does not count a deleted flow, and lets the admin raise or remove the limit', async () => {
    await as('user-harold');
    await setLimit('user-minh', 1);
    await as('user-minh');
    const mine = (await store.listFlows()).filter((f) => f.ownerId === 'user-minh' && f.scope === 'personal');
    for (const f of mine.slice(1)) await store.deleteFlow(f.id);
    if (mine.length === 0) await store.createFlow({ name: 'First', scope: 'personal' });
    expect(await code(store.createFlow({ name: 'Second', scope: 'personal' }))).toBe('conflict');
    await store.deleteFlow((await store.listFlows()).find((f) => f.ownerId === 'user-minh')!.id);
    await store.createFlow({ name: 'Again', scope: 'personal' });
    await as('user-harold');
    await setLimit('user-minh', 5);
    await as('user-minh');
    await store.createFlow({ name: 'Raised', scope: 'personal' });
    await as('user-harold');
    await setLimit('user-minh', null);
    expect((await store.listUsers()).find((u) => u.id === 'user-minh')!.maxFlows).toBeNull();
  });

  it('is not a limit for an admin, and a limit of 0 means no flow at all', async () => {
    await as('user-harold');
    await setLimit('user-harold', 0);
    await store.createFlow({ name: 'Admin flow', scope: 'shared' });
    await setLimit('user-thu', 0);
    await as('user-thu');
    expect(await code(store.createFlow({ name: 'Nope', scope: 'personal' }))).toBe('conflict');
  });

  it('checks the value when the admin saves it, and only the admin can save it', async () => {
    await as('user-harold');
    const lan = (await store.listUsers()).find((u) => u.id === 'user-lan')!;
    for (const bad of [-1, 1.5, 10_001]) expect(await code(store.saveUser({ ...lan, maxFlows: bad })), String(bad)).toBe('invalid');
    await as('user-lan');
    expect(await code(store.saveUser({ ...lan, maxFlows: 99 }))).toBe('forbidden');
  });
});
