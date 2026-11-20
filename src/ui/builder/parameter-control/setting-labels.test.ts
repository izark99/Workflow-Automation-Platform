import { describe, expect, it } from 'vitest';
import { BINDABLE_SETTINGS } from '../../../engine/flow/bindable';
import { NODE_TYPES } from '../../../engine/flow/types';
import { SETTING_LABEL_KEYS, settingLabel } from './setting-labels';

describe('setting labels', () => {
  it('every setting that can take a parameter has a label, and nothing else has one', () => {
    for (const type of NODE_TYPES) {
      const have = Object.keys(SETTING_LABEL_KEYS[type] ?? {}).sort();
      const want = BINDABLE_SETTINGS[type].map((s) => s.name).sort();
      expect(have, type).toEqual(want);
    }
  });
  it('writes the label of the form, and the name of an unknown setting as it is', () => {
    expect(settingLabel('input_file', 'headerRow')).toBe('Header row');
    expect(settingLabel('output', 'format')).toBe('File type');
    expect(settingLabel('filter', 'whatever')).toBe('whatever');
  });
});
