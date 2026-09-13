import { describe, expect, it } from 'vitest';
import { canAutoFill } from '../../src/core/confidence-policy';

describe('confidence policy', () => {
  it.each([
    ['digits', 0.859, false], ['digits', 0.86, true],
    ['letters', 0.983, false], ['letters', 0.984, true],
    ['alphanumeric', 0.993, false], ['alphanumeric', 0.994, true],
    ['arithmetic', 0.619, false], ['arithmetic', 0.62, true],
  ] as const)('uses inclusive %s threshold at %s', (mode, confidence, expected) => {
    expect(canAutoFill({ kind: 'plain', displayText: '123', fillValue: '123', confidence, mode })).toBe(expected);
  });

  it('never permits structurally invalid OCR output', () => {
    expect(canAutoFill({ kind: 'invalid', reason: 'unsupported' })).toBe(false);
  });
});
