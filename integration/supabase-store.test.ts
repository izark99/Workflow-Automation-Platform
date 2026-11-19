// SupabaseStore against the full local stack (database, Auth, REST API). Run it with `npm run test:store`.
// Four real users sign in through Auth: an admin, an owner, a group member and another user. Every store call goes
// through PostgREST with their token, so row-level security is what answers.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { StoreError, SupabaseStore, type DataStore } from '../src/store';

const URL = process.env.STORE_API_URL ?? '';
const ANON = process.env.STORE_ANON_KEY ?? '';
const SERVICE = process.env.STORE_SERVICE_KEY ?? '';
const PASSWORD = 'integration-test-password-1';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service: SupabaseClient = createClient(URL, SERVICE, options);

const people = [
  { key: 'admin', name: 'Ada Admin', role: 'admin' },
  { key: 'owner', name: 'Olga Owner', role: 'user' },
  { key: 'member', name: 'Mia Member', role: 'user' },
  { key: 'other', name: 'Otto Other', role: 'user' },
] as const;
type Who = (typeof people)[number]['key'];

const stores = {} as Record<Who, DataStore>;
const ids = {} as Record<Who, string>;
let hrGroup = '';

/** The error a promise rejects with, as a StoreError. Fails the test when it resolves. */
async function refused(promise: Promise<unknown>): Promise<StoreError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(StoreError);
    return e as StoreError;
  }
  throw new Error('The call was expected to be refused, and it succeeded.');
}

beforeAll(async () => {
  expect(URL && ANON && SERVICE, 'run this test with npm run test:store').toBeTruthy();
  for (const p of people) {
    const { data, error } = await service.auth.admin.createUser({ email: `${p.key}@example.test`, password: PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`Could not create ${p.key}: ${error?.message}`);
    ids[p.key] = data.user.id;
    const profile = await service.from('profiles').upsert({ id: data.user.id, name: p.name, email: `${p.key}@example.test`, role: p.role });
    if (profile.error) throw new Error(`Could not create the profile of ${p.key}: ${profile.error.message}`);
  }
  const group = await service.from('groups').insert({ name: 'HR' }).select('id').single();
  hrGroup = group.data!.id as string;
  await service.from('group_members').insert({ group_id: hrGroup, user_id: ids.member });

  for (const p of people) {
    const client = createClient(URL, ANON, options);
    const { error } = await client.auth.signInWithPassword({ email: `${p.key}@example.test`, password: PASSWORD });
    if (error) throw new Error(`${p.key} could not sign in: ${error.message}`);
    stores[p.key] = new SupabaseStore(client);
  }
});

describe('users and groups', () => {
  it('knows who is signed in', async () => {
    expect(await stores.admin.currentUser()).toMatchObject({ name: 'Ada Admin', role: 'admin', groupIds: [] });
    expect(await stores.owner.currentUser()).toMatchObject({ name: 'Olga Owner', role: 'user' });
  });

  it('shows the user list and the groups to the admin only', async () => {
    // Other test files share this database, so look at the four users made here.
    const users = (await stores.admin.listUsers()).filter((u) => Object.values(ids).includes(u.id));
    expect(users.map((u) => u.name)).toEqual(['Ada Admin', 'Mia Member', 'Olga Owner', 'Otto Other']);
    expect(users.find((u) => u.name === 'Mia Member')?.groupIds).toEqual([hrGroup]);
    expect((await stores.admin.listGroups()).map((g) => g.name)).toEqual(['HR']);
    expect((await refused(stores.owner.listUsers())).code).toBe('forbidden');
    expect((await refused(stores.member.listGroups())).code).toBe('forbidden');
  });

  it('manages groups and users as the admin', async () => {
    const g = await stores.admin.saveGroup({ name: '  Finance  ' });
    expect(g.name).toBe('Finance');
    expect((await stores.admin.saveGroup({ id: g.id, name: 'Finance team' })).name).toBe('Finance team');
    expect((await refused(stores.admin.saveGroup({ name: 'finance team' }))).code).toBe('conflict');
    expect((await refused(stores.owner.saveGroup({ name: 'Mine' }))).code).toBe('forbidden');

    const saved = await stores.admin.saveUser({ id: ids.other, name: 'Otto Other', email: 'other@example.test', role: 'user', groupIds: [g.id] });
    expect(saved.groupIds).toEqual([g.id]);
    await stores.admin.deleteGroup(g.id);
    expect((await stores.admin.listUsers()).find((u) => u.id === ids.other)?.groupIds).toEqual([]);
    expect((await refused(stores.admin.deleteGroup(g.id))).code).toBe('not_found');

    const lastAdmin = await refused(stores.admin.saveUser({ id: ids.admin, name: 'Ada Admin', email: 'admin@example.test', role: 'user', groupIds: [] }));
    expect(lastAdmin.message).toContain('At least one active admin is needed');
    expect((await refused(stores.admin.saveUser({ id: '', name: 'New', email: 'new@example.test', role: 'user', groupIds: [] }))).message).toContain('Supabase Auth');
  });
});

describe('flows, access and names', () => {
  let personalId = '';
  let sharedId = '';

  it('creates a personal flow for a user and a shared flow for the admin', async () => {
    const personal = await stores.owner.createFlow({ name: ' Owner flow ', scope: 'personal' });
    personalId = personal.id;
    expect(personal).toMatchObject({ name: 'Owner flow', scope: 'personal', ownerName: 'Olga Owner' });
    expect(personal.versions).toHaveLength(1);
    expect(personal.versions[0]).toMatchObject({ versionNo: 1, status: 'draft', changeNote: 'First version' });
    expect((await refused(stores.owner.createFlow({ name: 'Shared by owner', scope: 'shared' }))).code).toBe('forbidden');
    expect((await refused(stores.owner.createFlow({ name: '  ', scope: 'personal' }))).message).toContain('needs a name');

    const shared = await stores.admin.createFlow({ name: 'Shared flow', scope: 'shared' });
    sharedId = shared.id;
    expect(shared.scope).toBe('shared');
  });

  it('gives a shared flow to a group and shows owner and group names to a member', async () => {
    expect((await refused(stores.member.setFlowGroups(sharedId, [hrGroup]))).code).toBe('forbidden');
    const withGroup = await stores.admin.setFlowGroups(sharedId, [hrGroup]);
    expect(withGroup.groupIds).toEqual([hrGroup]);

    const seen = (await stores.member.listFlows()).map((f) => f.name);
    expect(seen).toEqual(['Shared flow']);
    const flow = await stores.member.getFlow(sharedId);
    expect(flow.ownerName).toBe('Ada Admin');
    expect(flow.groupNames).toEqual(['HR']);
    expect((await stores.owner.listFlows()).map((f) => f.name)).toEqual(['Owner flow']);
    expect(await stores.other.listFlows()).toEqual([]);
    expect((await refused(stores.other.getFlow(personalId))).code).toBe('not_found');
    expect((await refused(stores.member.getFlow(personalId))).code).toBe('not_found');
    expect((await refused(stores.admin.setFlowGroups(personalId, []))).code).toBe('invalid');
  });

  it('lets a member copy a shared flow and edit the copy, but not the shared flow', async () => {
    const copy = await stores.member.copyFlow(sharedId, '');
    expect(copy).toMatchObject({ name: 'Shared flow (copy)', scope: 'personal', ownerName: 'Mia Member' });
    const edited = await stores.member.saveFlowVersion(copy.id, 1, { definition: { schemaVersion: 1, nodes: [{ id: 'n1' }], edges: [] }, changeNote: 'edited' });
    expect(edited.versions[0]).toMatchObject({ changeNote: 'edited', definition: { schemaVersion: 1, nodes: [{ id: 'n1' }], edges: [] } });
    const refusedEdit = await refused(stores.member.saveFlowVersion(sharedId, 1, { changeNote: 'x' }));
    expect(refusedEdit.code).toBe('forbidden');
    expect(refusedEdit.message).toContain('Copy it to a personal flow');
    expect((await refused(stores.member.createFlowVersion(sharedId, { validFrom: '2027-01-01' }))).code).toBe('forbidden');
  });

  it('publishes versions: the previous open-ended version ends the day before, overlaps are refused', async () => {
    await stores.owner.saveFlowVersion(personalId, 1, { validFrom: '2026-01-01' });
    let flow = await stores.owner.publishFlowVersion(personalId, 1);
    expect(flow.versions[0]).toMatchObject({ status: 'published', validTo: null });

    flow = await stores.owner.createFlowVersion(personalId, { validFrom: '2026-07-01', copyFrom: 1, changeNote: 'July' });
    expect(flow.versions.map((v) => `${v.versionNo}:${v.status}`)).toEqual(['1:published', '2:draft']);
    flow = await stores.owner.publishFlowVersion(personalId, 2);
    expect(flow.versions[0]).toMatchObject({ versionNo: 1, validTo: '2026-06-30' });
    expect(flow.versions[1]).toMatchObject({ versionNo: 2, status: 'published', validTo: null });

    const readOnly = await refused(stores.owner.saveFlowVersion(personalId, 1, { changeNote: 'x' }));
    expect(readOnly.code).toBe('conflict');
    expect(readOnly.message).toContain('published and read-only');

    await stores.owner.createFlowVersion(personalId, { validFrom: '2026-03-01' });
    const overlap = await refused(stores.owner.publishFlowVersion(personalId, 3));
    expect(overlap.code).toBe('conflict');
    expect(overlap.message).toContain('overlap');
    expect((await refused(stores.owner.createFlowVersion(personalId, { validFrom: 'soon' }))).code).toBe('invalid');
    expect((await refused(stores.owner.publishFlowVersion(personalId, 9))).code).toBe('not_found');
  });

  it('deletes softly, restores as the admin, removes for good, and removes expired flows', async () => {
    const flow = await stores.owner.createFlow({ name: 'To delete', scope: 'personal' });
    await stores.owner.deleteFlow(flow.id);
    expect((await stores.owner.listFlows()).map((f) => f.name)).not.toContain('To delete');
    expect((await refused(stores.owner.getFlow(flow.id))).code).toBe('not_found');
    expect((await stores.admin.listDeletedFlows()).map((f) => f.name)).toContain('To delete');
    expect((await refused(stores.owner.listDeletedFlows())).code).toBe('forbidden');
    expect((await refused(stores.owner.restoreFlow(flow.id))).code).toBe('forbidden');

    expect((await stores.admin.restoreFlow(flow.id)).deletedAt).toBeNull();
    expect((await stores.owner.listFlows()).map((f) => f.name)).toContain('To delete');

    await stores.owner.deleteFlow(flow.id);
    await stores.admin.purgeFlow(flow.id);
    expect((await stores.admin.listDeletedFlows()).map((f) => f.id)).not.toContain(flow.id);
    expect((await refused(stores.admin.purgeFlow(flow.id))).code).toBe('not_found');
    expect((await refused(stores.owner.purgeExpired())).code).toBe('forbidden');

    const old = await stores.owner.createFlow({ name: 'Old', scope: 'personal' });
    const fresh = await stores.owner.createFlow({ name: 'Fresh', scope: 'personal' });
    await stores.owner.deleteFlow(old.id);
    await stores.owner.deleteFlow(fresh.id);
    const aged = await service.from('flows').update({ deleted_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq('id', old.id).select('id');
    expect(aged.data).toHaveLength(1);
    expect(await stores.admin.purgeExpired()).toBe(1);
    const left = (await stores.admin.listDeletedFlows()).map((f) => f.id);
    expect(left).toContain(fresh.id);
    expect(left).not.toContain(old.id);
  });

  it('logs runs with counts only, for a flow the caller can see', async () => {
    const entry = await stores.member.addRunLog({ flowId: sharedId, versionNo: 1, effectiveDate: '2026-09-30', inputRows: 10, outputRows: 4, status: 'ok' });
    expect(entry).toMatchObject({ flowId: sharedId, versionNo: 1, userId: ids.member, inputRows: 10, outputRows: 4, status: 'ok' });
    expect((await stores.member.listRunLog(sharedId)).map((r) => r.id)).toEqual([entry.id]);
    expect((await stores.owner.listRunLog(personalId)).length).toBe(0);
    expect((await refused(stores.other.addRunLog({ flowId: sharedId, versionNo: 1, effectiveDate: '2026-09-30', inputRows: 1, outputRows: 1, status: 'ok' }))).code).toBe('not_found');
    expect((await refused(stores.other.listRunLog(sharedId))).code).toBe('not_found');
  });
});

describe('reference tables', () => {
  let tableId = '';

  it('is created by the admin and read by everyone', async () => {
    const table = await stores.admin.createRefTable({ name: ' Limits ', description: 'OT limits', columns: [{ name: 'CODE', type: 'text' }, { name: 'LIMIT', type: 'number' }] });
    tableId = table.id;
    expect(table).toMatchObject({ name: 'Limits', description: 'OT limits' });
    expect(table.versions).toHaveLength(1);
    expect(table.versions[0]).toMatchObject({ versionNo: 1, status: 'draft', rows: [] });
    expect((await refused(stores.admin.createRefTable({ name: 'limits', description: '', columns: [] }))).code).toBe('conflict');
    expect((await refused(stores.owner.createRefTable({ name: 'Mine', description: '', columns: [] }))).code).toBe('forbidden');
    for (const who of ['owner', 'member', 'other'] as const) {
      expect((await stores[who].listRefTables()).map((t) => t.name)).toEqual(['Limits']);
    }
  });

  it('saves rows in a draft, publishes it, and keeps a published version read-only', async () => {
    await stores.admin.saveRefTableVersion(tableId, 1, { validFrom: '2026-01-01', rows: [['A', 10], ['B', 20]] });
    expect((await refused(stores.owner.saveRefTableVersion(tableId, 1, { rows: [] }))).code).toBe('forbidden');
    let table = await stores.admin.publishRefTableVersion(tableId, 1);
    expect(table.versions[0]).toMatchObject({ status: 'published', rows: [['A', 10], ['B', 20]] });
    expect((await refused(stores.admin.saveRefTableVersion(tableId, 1, { rows: [] }))).code).toBe('conflict');

    table = await stores.admin.createRefTableVersion(tableId, { validFrom: '2026-07-01', copyFrom: 1 });
    expect(table.versions[1]).toMatchObject({ versionNo: 2, status: 'draft', rows: [['A', 10], ['B', 20]] });
    const tooMany = Array.from({ length: 50_001 }, (_, i) => [`k${i}`, i]);
    expect((await refused(stores.admin.saveRefTableVersion(tableId, 2, { rows: tooMany }))).message).toContain('at most 50,000 rows');
    table = await stores.admin.publishRefTableVersion(tableId, 2);
    expect(table.versions[0]).toMatchObject({ versionNo: 1, validTo: '2026-06-30' });
    expect((await stores.other.listRefTables())[0]?.versions.map((v) => v.status)).toEqual(['published', 'published']);
  });
});

describe('what a signed-out visitor sees', () => {
  it('gets nothing from the tables', async () => {
    const visitor = createClient(URL, ANON, options);
    const flows = await visitor.from('flows').select('id');
    expect(flows.error?.code ?? 'none').toBe('42501');
    const tables = await visitor.from('ref_tables').select('id');
    expect(tables.error?.code ?? 'none').toBe('42501');
    expect((await refused(new SupabaseStore(visitor).listFlows())).code).toBe('forbidden');
  });
});

describe('saveUiTexts (both languages in one transaction)', () => {
  const read = async () => (await stores.other.listUiTexts()).filter((t) => t.key.startsWith('nav.')).map((t) => `${t.locale}:${t.key}=${t.value}`).sort();
  it('the admin saves two languages and resets one in one call; every user reads them', async () => {
    await stores.admin.saveUiTexts({ entries: [{ locale: 'vi', key: 'nav.admin', value: 'Điều khiển' }], resets: [] });
    await stores.admin.saveUiTexts({
      entries: [
        { locale: 'en', key: 'nav.flows', value: 'Pipelines' },
        { locale: 'vi', key: 'nav.flows', value: 'Quy trình' },
      ],
      resets: [{ locale: 'vi', key: 'nav.admin' }],
    });
    expect(await read()).toEqual(['en:nav.flows=Pipelines', 'vi:nav.flows=Quy trình']);
  });
  it('a user is refused, and a bad entry stores nothing of the call', async () => {
    expect((await refused(stores.owner.saveUiTexts({ entries: [{ locale: 'en', key: 'nav.admin', value: 'X' }], resets: [] }))).code).toBe('forbidden');
    await refused(
      stores.admin.saveUiTexts({
        entries: [
          { locale: 'en', key: 'nav.admin', value: 'Control' },
          { locale: 'fr' as 'en', key: 'nav.admin', value: 'Oops' },
        ],
        resets: [{ locale: 'en', key: 'nav.flows' }],
      }),
    );
    expect(await read()).toEqual(['en:nav.flows=Pipelines', 'vi:nav.flows=Quy trình']);
    await stores.admin.saveUiTexts({ entries: [], resets: [{ locale: 'en', key: 'nav.flows' }, { locale: 'vi', key: 'nav.flows' }] });
    expect(await read()).toEqual([]);
  });
});
