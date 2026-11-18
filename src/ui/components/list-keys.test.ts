import { describe, expect, it } from 'vitest';
import { isTypeAheadKey, moveIndex, typeAhead } from './list-keys';

describe('moveIndex', () => {
  it('moves by one and stops at both ends', () => {
    expect(moveIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(moveIndex(2, 3, 'ArrowDown')).toBe(2);
    expect(moveIndex(1, 3, 'ArrowUp')).toBe(0);
    expect(moveIndex(0, 3, 'ArrowUp')).toBe(0);
  });
  it('Home and End jump to the ends; an empty list gives -1', () => {
    expect(moveIndex(1, 3, 'Home')).toBe(0);
    expect(moveIndex(1, 3, 'End')).toBe(2);
    expect(moveIndex(0, 0, 'ArrowDown')).toBe(-1);
  });
});

describe('typeAhead', () => {
  const labels = ['Admin', 'Accounting', 'Billing', 'HR Payroll', 'Human resources'];
  it('finds the next label that starts with the letter, ignoring case', () => {
    expect(typeAhead(labels, 0, 'b')).toBe(2);
    expect(typeAhead(labels, 0, 'H')).toBe(3);
  });
  it('a repeated letter cycles, wrapping around', () => {
    expect(typeAhead(labels, 3, 'h')).toBe(4);
    expect(typeAhead(labels, 4, 'h')).toBe(3);
    expect(typeAhead(labels, 1, 'a')).toBe(0);
  });
  it('a longer text narrows and may stay on the current option', () => {
    expect(typeAhead(labels, 3, 'hu')).toBe(4);
    expect(typeAhead(labels, 1, 'acc')).toBe(1);
  });
  it('gives -1 when nothing matches or nothing is typed', () => {
    expect(typeAhead(labels, 0, 'z')).toBe(-1);
    expect(typeAhead(labels, 0, '')).toBe(-1);
  });
  it('treats only a plain printable character as type-ahead', () => {
    const k = { ctrlKey: false, metaKey: false, altKey: false };
    expect(isTypeAheadKey({ key: 'a', ...k })).toBe(true);
    expect(isTypeAheadKey({ key: ' ', ...k })).toBe(false);
    expect(isTypeAheadKey({ key: 'Enter', ...k })).toBe(false);
    expect(isTypeAheadKey({ key: 'a', ...k, ctrlKey: true })).toBe(false);
  });
});
