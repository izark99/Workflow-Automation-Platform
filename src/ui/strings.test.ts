import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('strings.xlsxTooLarge', () => {
  const msg = strings.xlsxTooLarge('big file.xlsx', 301_234_567, 300_002_342);
  it('says what failed and what to do next', () => {
    expect(msg).toContain('big file.xlsx');
    expect(msg).toContain('301.2 MB');
    expect(msg).toContain('300.0 MB');
    expect(msg).toMatch(/save the sheet as \.csv/);
  });
});
