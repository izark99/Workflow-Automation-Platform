import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES, engineText, fillTemplate, megabytes } from './messages';
import { coded } from './types';

describe('engine messages', () => {
  it('fills placeholders and leaves a missing one visible', () => {
    expect(fillTemplate('Step "{step}" failed: {reason}', { step: 'a', reason: 'b' })).toBe('Step "a" failed: b');
    expect(fillTemplate('Step "{step}"', {})).toBe('Step "{step}"');
  });
  it('the too-large text says what failed and what to do next', () => {
    const text = engineText('engine.fileTooLarge', { fileName: 'big file.xlsx', size: megabytes(301_234_567), limit: megabytes(300_002_342) });
    expect(text).toContain('big file.xlsx');
    expect(text).toContain('301.2 MB');
    expect(text).toContain('300.0 MB');
    expect(text).toMatch(/save the sheet as \.csv/);
  });
  it('a coded error keeps the id and the parameters, and its message is the filled template', () => {
    const e = coded('node_failed', 'engine.noResult', { step: 's1' }, 's1');
    expect(e.messageId).toBe('engine.noResult');
    expect(e.params).toEqual({ step: 's1' });
    expect(e.message).toBe('Step "s1" has no result to show. Run the flow first.');
    expect(e.nodeId).toBe('s1');
  });
  it('every template says what to do next or ends with a full sentence', () => {
    for (const [id, text] of Object.entries(ENGINE_MESSAGES)) expect(text.trim().endsWith('.') || text.endsWith('}') , id).toBe(true);
  });
});

describe('the engine stays free of the UI', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
  it('no file of src/engine imports from src/ui, React or Supabase', () => {
    for (const file of files('src/engine')) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      const bad = imports.filter((i) => /(^|\/)ui(\/|$)/.test(i) || i === 'react' || i.startsWith('react/') || i.startsWith('@supabase'));
      expect(bad, file).toEqual([]);
    }
  });
});
