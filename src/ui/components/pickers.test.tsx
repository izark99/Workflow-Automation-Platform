import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DatePicker, Dropdown } from './index';

const options = [
  { value: 'v3', label: 'v3, from 01 Jul 2026' },
  { value: 'v2', label: 'v2, 01 Apr 2026 to 30 Jun 2026' },
];

describe('closed markup', () => {
  it('Dropdown is a listbox button that names its label and the selection, with no native select', () => {
    const out = renderToStaticMarkup(<Dropdown label="Version" options={options} value="v3" onChange={() => undefined} />);
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-label="Version: v3, from 01 Jul 2026"');
    expect(out).not.toContain('<select');
    expect(out).not.toContain('role="listbox"');
  });
  it('DatePicker shows 30 Sep 2026 and names itself, with no date input', () => {
    const out = renderToStaticMarkup(<DatePicker label="Effective date" value="2026-09-30" onChange={() => undefined} />);
    expect(out).toContain('30 Sep 2026');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(out).toContain('aria-label="Effective date: 30 Sep 2026. Change date"');
    expect(out).not.toContain('type="date"');
  });
});
