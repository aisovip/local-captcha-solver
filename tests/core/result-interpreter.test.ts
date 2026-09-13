import { describe, expect, it } from 'vitest';

import { MAX_OCR_TEXT_LENGTH } from '../../src/core/arithmetic';
import {
  interpretResult,
  resultInterpreter,
} from '../../src/core/result-interpreter';
import type { OcrResult } from '../../src/core/types';

describe('interpretResult', () => {
  it.each([
    ['digits', '00721'],
    ['letters', 'AbCdZ'],
    ['alphanumeric', 'aB09Z'],
  ] as const)('preserves valid %s text and confidence', (mode, text) => {
    expect(interpretResult({ text, confidence: 0.87, mode })).toEqual({
      kind: 'plain',
      displayText: text,
      fillValue: text,
      confidence: 0.87,
    });
  });

  it.each([
    [{ mode: 'digits', text: '12a' }, 'unsupported'],
    [{ mode: 'letters', text: 'Ab2' }, 'unsupported'],
    [{ mode: 'alphanumeric', text: '3+4' }, 'unsupported'],
    [{ mode: 'digits', text: ' 123 ' }, 'unsupported'],
    [{ mode: 'letters', text: 'A b' }, 'unsupported'],
    [{ mode: 'arithmetic', text: 'abc' }, 'unsupported'],
    [{ mode: 'arithmetic', text: '1/0' }, 'unsupported'],
    [{ mode: 'arithmetic', text: '1+2+3' }, 'unsupported'],
    [{ mode: 'arithmetic', text: '1.5+2' }, 'unsupported'],
  ] as const)('rejects $mode OCR text %j as $reason', ({ mode, text }, reason) => {
    expect(interpretResult({ text, confidence: 0.4, mode })).toEqual({
      kind: 'invalid',
      reason,
    });
  });

  it.each([
    { mode: 'digits', text: '' },
    { mode: 'letters', text: ' \t\n ' },
    { mode: 'arithmetic', text: '   ' },
  ] as const)('classifies empty $mode OCR text', ({ mode, text }) => {
    expect(interpretResult({ text, confidence: 0.1, mode })).toEqual({
      kind: 'invalid',
      reason: 'empty',
    });
  });

  it('computes an arithmetic fill value and formats a stable display value', () => {
    expect(
      interpretResult({ text: ' 6 × 4 ? ', confidence: 0.93, mode: 'arithmetic' }),
    ).toEqual({
      kind: 'arithmetic',
      displayText: '6*4 = 24',
      fillValue: '24',
      confidence: 0.93,
    });
  });

  it.each(['7/2', ' 7 ÷ 2 = '])(
    'preserves non-integer division confirmation data for %j',
    (text) => {
      expect(interpretResult({ text, confidence: 0.8, mode: 'arithmetic' })).toEqual({
        kind: 'invalid',
        reason: 'non_integer_division',
        displayText: '7/2',
        confidence: 0.8,
      });
    },
  );

  it('accepts 64 source characters without truncating and rejects 65', () => {
    const atLimit = 'A'.repeat(MAX_OCR_TEXT_LENGTH);
    const overLimit = 'A'.repeat(MAX_OCR_TEXT_LENGTH + 1);

    expect(interpretResult({ text: atLimit, confidence: 1, mode: 'letters' })).toEqual({
      kind: 'plain',
      displayText: atLimit,
      fillValue: atLimit,
      confidence: 1,
    });
    expect(interpretResult({ text: overLimit, confidence: 1, mode: 'letters' })).toEqual({
      kind: 'invalid',
      reason: 'unsupported',
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01])(
    'rejects hostile confidence %s',
    (confidence) => {
      expect(interpretResult({ text: '1234', confidence, mode: 'digits' })).toEqual({
        kind: 'invalid',
        reason: 'unsupported',
      });
    },
  );

  it('accepts confidence boundaries zero and one', () => {
    expect(interpretResult({ text: '0', confidence: 0, mode: 'digits' })).toMatchObject({
      kind: 'plain',
      confidence: 0,
    });
    expect(interpretResult({ text: '1', confidence: 1, mode: 'digits' })).toMatchObject({
      kind: 'plain',
      confidence: 1,
    });
  });
});

describe('resultInterpreter', () => {
  it('maps OCR results in their original order', () => {
    const results: readonly OcrResult[] = [
      { text: 'AbC', confidence: 0.91, mode: 'letters' },
      { text: '12-5=', confidence: 0.88, mode: 'arithmetic' },
      { text: '4/3', confidence: 0.77, mode: 'arithmetic' },
      { text: 'A-1', confidence: 0.66, mode: 'alphanumeric' },
    ];

    expect(resultInterpreter.interpret(results)).toEqual([
      { kind: 'plain', displayText: 'AbC', fillValue: 'AbC', confidence: 0.91 },
      { kind: 'arithmetic', displayText: '12-5 = 7', fillValue: '7', confidence: 0.88 },
      {
        kind: 'invalid',
        reason: 'non_integer_division',
        displayText: '4/3',
        confidence: 0.77,
      },
      { kind: 'invalid', reason: 'unsupported' },
    ]);
  });
});
