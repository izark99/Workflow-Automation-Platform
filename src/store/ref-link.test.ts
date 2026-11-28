import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore, MemoryAdapter } from './local-store';
import { seedSnapshot } from './seed';
import { StoreError } from './types';
import type { Column } from '../engine/types';
import type { RefTableRecord } from './types';

// The linked reference tables of SPEC 16.2 on the local store. T9.11 runs the same cases on the database path.
const NOW = new Date('2026-11-17T08:00:00.000Z');
let store: LocalStore;
beforeEach(() => {
  store = new LocalStore({ adapter: new MemoryAdapter(), seed: seedSnapshot, now: () => NOW });
});

const err = async (p: Promise<unknown>): Promise<StoreError> => p.then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e as StoreError);
const text: Column[] = [{ name: 'dept', type: 'text' }, { name: 'note', type: 'text' }];

/** A published table with a start date and rows of one column (and an empty second column). */
async function table(name: string, values: string[], validFrom = '2026-01-01', cols: Column[] = text): Promise<RefTableRecord> {
  const t = await store.createRefTable({ name, description: '', columns: cols });
  await store.saveRefTableVersion(t.id, 1, { validFrom, rows: values.map((v) => [v, null]) });
  return store.publishRefTableVersion(t.id, 1);
}
/** A new version of A with these values, published. */
async function newVersionOf(a: RefTableRecord, validFrom: string, values: string[]): Promise<RefTableRecord> {
  const made = await store.createRefTableVersion(a.id, { validFrom, copyFrom: 1 });
  const no = Math.max(...made.versions.map((v) => v.versionNo));
  await store.saveRefTableVersion(a.id, no, { rows: values.map((v) => [v, null]) });
  return store.publishRefTableVersion(a.id, no);
}
const get = async (id: string) => (await store.listRefTables()).find((t) => t.id === id)!;
const drafts = (t: RefTableRecord) => t.versions.filter((v) => v.status === 'draft');
const keys = (t: RefTableRecord, no: number) => t.versions.find((v) => v.versionNo === no)!.rows.map((r) => r[0]);

describe('linking', () => {
  it('gives B a draft with the distinct values of the column of A that is in effect today, the other columns empty, and an open notice', async () => {
    const a = await table('Departments', ['Kho', ' QA ', 'Kho', '', 'Sản xuất']);
    const b = await table('Costs', [], '2026-01-01', [{ name: 'dept', type: 'text' }, { name: 'limit', type: 'number' }]);
    const linked = await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    expect(linked.link).toEqual({ tableId: a.id, column: 'dept', keyColumn: 'dept' });
    const t = await get(b.id);
    const draft = drafts(t)[0]!;
    expect(draft.rows).toEqual([['Kho', null], ['QA', null], ['Sản xuất', null]]);
    // B's published version starts on 1 Jan 2026 and the link is made on 17 Nov 2026, which is after it: the draft starts today.
    expect(draft.validFrom).toBe('2026-11-17');
    const notices = await store.listRefLinkNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ tableId: b.id, tableName: 'Costs', sourceName: 'Departments', column: 'dept', draftVersionNo: draft.versionNo, values: ['Kho', 'QA', 'Sản xuất'] });
  });

  it('adds the key column as the first column when B has none, keeps the rows B has, and does not add a value that B holds already', async () => {
    const a = await table('Departments', ['Kho', 'QA']);
    const made = await store.createRefTable({ name: 'Costs', description: '', columns: [{ name: 'limit', type: 'text' }] });
    await store.saveRefTableVersion(made.id, 1, { validFrom: '2026-01-01', rows: [['10'], ['20']] });
    await store.publishRefTableVersion(made.id, 1);
    await store.linkRefTable(made.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const draft = drafts(await get(made.id))[0]!;
    expect(draft.columns.map((c) => c.name)).toEqual(['dept', 'limit']);
    expect(draft.rows).toEqual([[null, '10'], [null, '20'], ['Kho', null], ['QA', null]]);
    // A second link of a published table that holds one of the values does not add it again.
    const c = await table('Budgets', ['Kho'], '2026-01-01', [{ name: 'dept', type: 'text' }, { name: 'n', type: 'text' }]);
    await store.linkRefTable(c.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    expect(drafts(await get(c.id))[0]!.rows.map((r) => r[0])).toEqual(['Kho', 'QA']);
    expect((await store.listRefLinkNotices()).find((n) => n.tableId === c.id)!.values).toEqual(['QA']);
  });

  it('refuses a link to itself, a cycle (with the names), a missing column, a table that is linked already and a key column that is not text', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    const c = await table('Budgets', [], '2026-01-01', [{ name: 'dept', type: 'text' }, { name: 'n', type: 'number' }]);
    expect((await err(store.linkRefTable(a.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' }))).messageId).toBe('errors.refLinkSelf');
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const cycle = await err(store.linkRefTable(a.id, { sourceTableId: b.id, column: 'dept', keyColumn: 'dept' }));
    expect(cycle.messageId).toBe('errors.refLinkCycle');
    expect(cycle.message).toContain('Departments → Costs → Departments');
    expect((await err(store.linkRefTable(c.id, { sourceTableId: a.id, column: 'nope', keyColumn: 'dept' }))).messageId).toBe('errors.refLinkColumnMissing');
    expect((await err(store.linkRefTable(b.id, { sourceTableId: c.id, column: 'dept', keyColumn: 'dept' }))).messageId).toBe('errors.refLinkAlreadyLinked');
    expect((await err(store.linkRefTable(c.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'n' }))).messageId).toBe('errors.refLinkKeyType');
    expect((await err(store.linkRefTable(c.id, { sourceTableId: a.id, column: 'dept', keyColumn: ' ' }))).messageId).toBe('errors.refLinkKeyName');
    expect((await err(store.linkRefTable(c.id, { sourceTableId: 'ref-nope', column: 'dept', keyColumn: 'dept' }))).messageId).toBe('errors.refLinkSourceMissing');
  });

  it('allows a chain and a table that feeds several tables', async () => {
    const a = await table('A', ['x']);
    const b = await table('B', []);
    const c = await table('C', []);
    const d = await table('D', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    // B has no published version yet, so C takes its values when B is published and C is linked after it.
    await store.publishRefTableVersion(b.id, drafts(await get(b.id))[0]!.versionNo);
    await store.linkRefTable(c.id, { sourceTableId: b.id, column: 'dept', keyColumn: 'dept' });
    await store.linkRefTable(d.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    expect(drafts(await get(c.id))[0]!.rows.map((r) => r[0])).toEqual(['x']);
    expect(drafts(await get(d.id))[0]!.rows.map((r) => r[0])).toEqual(['x']);
  });
});

describe('a published version of A', () => {
  it('adds the new values to the draft of B, never publishes B, and leaves a value that left A in B', async () => {
    const a = await table('Departments', ['Kho', 'QA']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const first = drafts(await get(b.id))[0]!;
    await store.publishRefTableVersion(b.id, first.versionNo); // the admin publishes B with the first values
    expect(await store.listRefLinkNotices()).toEqual([]);

    const published = (await get(b.id)).versions.filter((v) => v.status === 'published').length;
    // A's next version drops QA and adds Vận chuyển and ' Vận chuyển' again (a duplicate after trimming).
    await newVersionOf(a, '2026-12-01', ['Kho', 'Vận chuyển', ' Vận chuyển']);
    const t = await get(b.id);
    expect(t.versions.filter((v) => v.status === 'published')).toHaveLength(published);
    const draft = drafts(t)[0]!;
    // The draft is a copy of the last published version plus the new value: QA stays.
    expect(draft.rows.map((r) => r[0])).toEqual(['Kho', 'QA', 'Vận chuyển']);
    expect(draft.validFrom).toBe('2026-12-01');
    const [notice] = await store.listRefLinkNotices();
    expect(notice).toMatchObject({ tableId: b.id, values: ['Vận chuyển'], draftVersionNo: draft.versionNo });
  });

  it('starts the draft the day after the end of the last published version of B when A starts before it, and adds to a draft that exists', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', [], '2026-01-01');
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    await store.publishRefTableVersion(b.id, drafts(await get(b.id))[0]!.versionNo);
    // B's published versions now are v1 (ended) and v2 (from today). A new version of A that starts long before gives a draft after v2's start.
    await newVersionOf(a, '2026-02-01', ['Kho', 'QA']);
    const draft = drafts(await get(b.id))[0]!;
    expect(draft.validFrom).toBe('2026-11-18');
    await newVersionOf(a, '2027-01-01', ['Kho', 'QA', 'IT']);
    const t = await get(b.id);
    expect(drafts(t)).toHaveLength(1);
    expect(keys(t, draft.versionNo)).toEqual(['Kho', 'QA', 'IT']);
    // One open notice holds all the values that were added to the draft.
    const notices = await store.listRefLinkNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]!.values).toEqual(['QA', 'IT']);
  });

  it('is not changed by a draft of A: B gets nothing until the version is published', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    await store.publishRefTableVersion(b.id, drafts(await get(b.id))[0]!.versionNo);
    const made = await store.createRefTableVersion(a.id, { validFrom: '2026-12-01', copyFrom: 1 });
    const no = Math.max(...made.versions.map((v) => v.versionNo));
    await store.saveRefTableVersion(a.id, no, { rows: [['Kho', null], ['New', null]] });
    expect(drafts(await get(b.id))).toHaveLength(0);
    expect(await store.listRefLinkNotices()).toEqual([]);
  });

  it('updates a chain A to B to C in one publish, and publishes none of them', async () => {
    const a = await table('A', ['x']);
    const b = await table('B', []);
    const c = await table('C', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    await store.linkRefTable(c.id, { sourceTableId: b.id, column: 'dept', keyColumn: 'dept' });
    await store.publishRefTableVersion(b.id, drafts(await get(b.id))[0]!.versionNo);
    await store.publishRefTableVersion(c.id, drafts(await get(c.id))[0]!.versionNo);
    await newVersionOf(a, '2026-12-01', ['x', 'y']);
    expect(drafts(await get(b.id))[0]!.rows.map((r) => r[0])).toEqual(['x', 'y']);
    expect(drafts(await get(c.id))[0]!.rows.map((r) => r[0])).toEqual(['x', 'y']);
    expect((await store.listRefLinkNotices()).map((n) => n.tableName).sort()).toEqual(['B', 'C']);
  });

  it('is refused when the version lacks the linked column, names the linked tables and changes nothing', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const made = await store.createRefTableVersion(a.id, { validFrom: '2026-12-01', copyFrom: 1 });
    const no = Math.max(...made.versions.map((v) => v.versionNo));
    await store.saveRefTableVersion(a.id, no, { columns: [{ name: 'note', type: 'text' }], rows: [['x']] });
    const e = await err(store.publishRefTableVersion(a.id, no));
    expect(e.messageId).toBe('errors.refLinkPublishColumn');
    expect(e.message).toContain('Costs');
    expect((await get(a.id)).versions.find((v) => v.versionNo === no)!.status).toBe('draft');
  });
});

describe('the notice', () => {
  it('closes when the draft that holds the values is published', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    expect(await store.listRefLinkNotices()).toHaveLength(1);
    await store.publishRefTableVersion(b.id, drafts(await get(b.id))[0]!.versionNo);
    expect(await store.listRefLinkNotices()).toEqual([]);
  });
  it('is seen by an admin only; a user sees no notice and no link, and cannot link', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    await store.switchUser('user-minh');
    expect(await store.listRefLinkNotices()).toEqual([]);
    expect((await store.listRefTables()).every((t) => t.link === undefined)).toBe(true);
    expect((await err(store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' }))).code).toBe('forbidden');
    expect((await err(store.unlinkRefTable(b.id))).code).toBe('forbidden');
  });
});

describe('unlinking and deleting', () => {
  it('Unlink keeps the rows, closes the notice and stops the cascade', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const unlinked = await store.unlinkRefTable(b.id);
    expect(unlinked.link).toBeNull();
    expect(await store.listRefLinkNotices()).toEqual([]);
    expect(drafts(await get(b.id))[0]!.rows.map((r) => r[0])).toEqual(['Kho']);
    await newVersionOf(a, '2026-12-01', ['Kho', 'QA']);
    expect(drafts(await get(b.id))[0]!.rows).toHaveLength(1);
    expect((await err(store.unlinkRefTable(b.id))).messageId).toBe('errors.refLinkNotLinked');
  });
  it('deleting A is refused while a table is linked to it and names the tables; deleting B drops its link and notice', async () => {
    const a = await table('Departments', ['Kho']);
    const b = await table('Costs', []);
    const c = await table('Budgets', []);
    await store.linkRefTable(b.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    await store.linkRefTable(c.id, { sourceTableId: a.id, column: 'dept', keyColumn: 'dept' });
    const e = await err(store.deleteRefTable(a.id));
    expect(e.messageId).toBe('errors.refLinkDeleteSource');
    expect(e.message).toContain('Costs, Budgets');
    await store.deleteRefTable(b.id);
    expect((await store.listRefLinkNotices()).map((n) => n.tableName)).toEqual(['Budgets']);
    await store.unlinkRefTable(c.id);
    await store.deleteRefTable(a.id);
    expect((await store.listRefTables()).map((t) => t.name)).not.toContain('Departments');
  });
});
