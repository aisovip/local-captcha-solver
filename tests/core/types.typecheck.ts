import { expectTypeOf } from 'vitest';

import { resultInterpreter } from '../../src/core/result-interpreter';
import type {
  FieldMatch,
  InterpretedResult,
  OcrEngine,
  OcrResult,
  ScoreResult,
  WorkflowResult,
} from '../../src/core/types';

expectTypeOf<Extract<InterpretedResult, { reason: 'empty' | 'unsupported' }>>()
  .toEqualTypeOf<{ kind: 'invalid'; reason: 'empty' | 'unsupported' }>();
expectTypeOf<ReturnType<typeof resultInterpreter.interpret>>()
  .toEqualTypeOf<readonly InterpretedResult[]>();
expectTypeOf<Awaited<ReturnType<OcrEngine['recognize']>>>()
  .toEqualTypeOf<readonly OcrResult[]>();

type Field = { id: string };
type Candidates = readonly { field: Field; score: number; reasons: readonly string[] }[];

expectTypeOf<Extract<FieldMatch<Field>, { state: 'unique' }>>()
  .toEqualTypeOf<{ state: 'unique'; winner: Field; candidates: Candidates }>();
expectTypeOf<Extract<FieldMatch<Field>, { state: 'ambiguous' }>>()
  .toEqualTypeOf<{ state: 'ambiguous'; winner?: never; candidates: Candidates }>();
expectTypeOf<Extract<FieldMatch<Field>, { state: 'none' }>>()
  .toEqualTypeOf<{ state: 'none'; winner?: never; candidates: Candidates }>();
expectTypeOf<ScoreResult['reasons']>().toEqualTypeOf<readonly string[]>();

expectTypeOf<WorkflowResult['state']>().toEqualTypeOf<
  | 'filled'
  | 'needs_confirmation'
  | 'no_candidate'
  | 'no_field'
  | 'image_unavailable'
  | 'permission_denied'
  | 'recognition_failed'
  | 'stale'
  | 'model_unavailable'
  | 'ambiguous_image'
>();
expectTypeOf<Extract<WorkflowResult, { state: 'needs_confirmation' }>['fieldIds']>()
  .toEqualTypeOf<readonly string[]>();
