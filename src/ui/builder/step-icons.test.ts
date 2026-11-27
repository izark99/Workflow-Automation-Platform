import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../engine/flow/types';
import { DRAWN_EXTRAS, ICON_NAMES, LUCIDE_EXTRAS } from '../components/icons';
import { STEP_ICONS } from './step-icons';

describe('the icons of the steps', () => {
  it('gives every step type an icon, and only the types of the catalog', () => {
    expect(Object.keys(STEP_ICONS).sort()).toEqual([...NODE_TYPES].sort());
  });
  it('uses only icons of the Harold set: not the two from Lucide and not the ones drawn for Phase 8', () => {
    for (const [type, icon] of Object.entries(STEP_ICONS)) {
      expect(ICON_NAMES as string[], type).toContain(icon);
      expect(LUCIDE_EXTRAS as readonly string[], type).not.toContain(icon);
      expect(DRAWN_EXTRAS as readonly string[], type).not.toContain(icon);
    }
  });
  it('the Harold set has 47 icons, so the choice is among those', () => {
    expect(ICON_NAMES.filter((n) => !(LUCIDE_EXTRAS as readonly string[]).includes(n) && !(DRAWN_EXTRAS as readonly string[]).includes(n))).toHaveLength(47);
  });
});
