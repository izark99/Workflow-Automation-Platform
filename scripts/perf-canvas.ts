// `npm run perf:canvas` (task T6.1, not a gate): drags one card on the canvas of the builder and writes the frame times
// and the render counts to docs/CANVAS_PERF.md. It changes no behaviour of the app.
// Usage: npm run perf:canvas [-- --moves=60]
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import { preview } from 'vite';
import { seedSnapshot } from '../src/store/seed.ts';
import { renderPerfReport, type DragMeasurement, type RenderCounts } from './lib/canvas-perf.ts';

const OUT_DIR = 'dist-perf';
const REPORT = 'docs/CANVAS_PERF.md';
const SHOTS = 'docs/canvas-perf';
const PORT = 4179;
const FLOW_ID = 'flow-perf';

const moves = Number(process.argv.find((a) => a.startsWith('--moves='))?.slice(8) ?? 60);

interface Def {
  schemaVersion: number;
  nodes: { id: string; type: string; label: string; position: { x: number; y: number }; settings: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
}

/** A chain of steps laid out in rows of six, like a flow that a person drew. */
function generated(steps: number): Def {
  const nodes = Array.from({ length: steps }, (_, i) => ({
    id: `s${i + 1}`,
    type: i === 0 ? 'input_file' : i === steps - 1 ? 'output' : 'column_mapping',
    label: `Step ${i + 1}`,
    position: { x: (i % 6) * 280, y: Math.floor(i / 6) * 120 },
    settings: {},
  }));
  const edges = nodes.slice(1).map((n, i) => ({ source: (nodes[i] as { id: string }).id, target: n.id }));
  return { schemaVersion: 1, nodes, edges };
}

async function seed(page: Page, def: unknown): Promise<void> {
  const s = seedSnapshot();
  s.flows.push({
    id: FLOW_ID,
    name: 'Canvas perf',
    ownerId: 'user-harold',
    scope: 'personal',
    deletedAt: null,
    groupIds: [],
    versions: [{ versionNo: 1, validFrom: '2026-01-01', validTo: null, status: 'draft', changeNote: '', definition: def }],
  });
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
}

const counts = (page: Page): Promise<RenderCounts> => page.evaluate(() => ({ ...((window as unknown as { __dfwRenders?: Record<string, number> }).__dfwRenders ?? {}) }));
const visibleCards = (page: Page): Promise<number> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__node')].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    }).length,
  );

async function measure(page: Page, label: string, def: Def | unknown, steps: number, slug: string): Promise<DragMeasurement> {
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await seed(page, def);
  await page.goto(`http://localhost:${PORT}/flows/${FLOW_ID}/versions/1`);
  await page.locator('.react-flow__node').first().waitFor({ timeout: 15_000 });
  await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, steps);
  await page.waitForTimeout(800); // the fit-view animation and the first paint settle

  // The card nearest to the middle of the canvas, so that the drag stays inside the page.
  const target = await page.evaluate(() => {
    const canvas = document.querySelector('.react-flow')!.getBoundingClientRect();
    const cx = canvas.x + canvas.width / 2;
    const cy = canvas.y + canvas.height / 2;
    let best: { x: number; y: number; d: number } | undefined;
    for (const el of document.querySelectorAll('.react-flow__node')) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
      if (!best || d < best.d) best = { x: r.x + r.width / 2, y: r.y + r.height / 2, d };
    }
    return best!;
  });

  const visibleBefore = await visibleCards(page);
  const rendersBefore = await counts(page);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__frames = [];
    w.__run = true;
    const tick = (t: number): void => {
      if (!w.__run) return;
      w.__frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  let visibleDuring = steps;
  for (let i = 1; i <= moves; i++) {
    await page.mouse.move(target.x + (200 * i) / moves, target.y + (100 * Math.sin((Math.PI * i) / moves)) + (60 * i) / moves);
    if (i % 6 === 0) visibleDuring = Math.min(visibleDuring, await visibleCards(page));
    // Start, middle and end of the drag, for the UI review (docs/UI_AUDIT_P6.md).
    if (i === 3) await page.screenshot({ path: `${SHOTS}/${slug}-start.png` });
    if (i === Math.floor(moves / 2)) await page.screenshot({ path: `${SHOTS}/${slug}-middle.png` });
    if (i === moves) await page.screenshot({ path: `${SHOTS}/${slug}-end.png` });
  }
  await page.mouse.up();
  const frameTimes = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean };
    w.__run = false;
    return w.__frames;
  });
  await page.waitForTimeout(300);
  const renders = await counts(page);
  return { label, steps, frameTimes, renders, rendersBefore, visibleBefore, visibleDuring, visibleAfter: await visibleCards(page), screenshot: `${SHOTS}/${slug}-middle.png` };
}

async function main(): Promise<void> {
  await mkdir(SHOTS, { recursive: true });
  // A production build with the counters on. The release build never sets VITE_PERF_COUNTERS.
  execFileSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_PERF_COUNTERS: 'true', VITE_DEV_ROUTES: 'true', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  });
  const server = await preview({ root: process.cwd(), build: { outDir: OUT_DIR }, preview: { port: PORT, strictPort: true } });
  const timesheet = JSON.parse(await readFile('flows/monthly-timesheet.flow.json', 'utf8')) as Def;
  const runs: DragMeasurement[] = [];
  try {
    const browser = await chromium.launch();
    try {
      const plan: [string, Def, string][] = [
        ['12 steps (generated)', generated(12), '12-steps'],
        [`${timesheet.nodes.length} steps (monthly-timesheet.flow.json)`, timesheet, 'timesheet'],
        ['60 steps (generated)', generated(60), '60-steps'],
      ];
      for (const [label, def, slug] of plan) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        runs.push(await measure(page, label, def, def.nodes.length, slug));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
    await rm(OUT_DIR, { recursive: true, force: true });
  }
  const md = renderPerfReport(runs, { generatedAt: new Date().toISOString().slice(0, 10), moves });
  await writeFile(REPORT, md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
