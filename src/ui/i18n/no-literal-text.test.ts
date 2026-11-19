import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { literalUiText } from './scan-literals';

// A scan of the migrated components for literal UI text. The route check of ui-rules cannot see closed popovers,
// dialogs that are not open or errors that were not triggered; this scan can. The list grows with the migration and
// covers every .tsx file of src/ui.
// Every .tsx file of src/ui (T4.7c3).
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsxFiles(`${dir}/${e.name}`) : e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx') ? [`${dir}/${e.name}`] : []));
}
const MIGRATED = tsxFiles('src/ui');

describe('no literal UI text in migrated files', () => {
  it.each(MIGRATED)('%s', (path) => {
    expect(literalUiText(path)).toEqual([]);
  });
  it('the scan finds literal text, text attributes and strings in JSX, and passes catalog calls', () => {
    const sample = `const a = <div title="Hello"><b>Plain</b>{'More'}<i>{t('k')}</i></div>;`;
    expect(literalUiText('sample.tsx', sample)).toHaveLength(3);
    expect(literalUiText('sample.tsx', `const a = <div title={t('k')}>{t('k')}</div>;`)).toEqual([]);
    expect(literalUiText('sample.tsx', `const o = [{ value: '', label: 'Choose a table' }];`)).toHaveLength(1);
  });
});
