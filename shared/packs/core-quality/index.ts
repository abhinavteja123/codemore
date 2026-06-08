/**
 * core-quality pack
 *
 * Universal correctness + maintainability rules. Targets every TS/JS
 * codebase, not just vibe-coded apps. Complements the vibe-* packs.
 */

import type { Rule } from '../../rules/Rule';
import { coreTypescriptAsAny } from './core-typescript-as-any';
import { coreBugsLooseEquality } from './core-bugs-loose-equality';
import { coreTypescriptNonNullAssertionAbuse } from './core-typescript-non-null-assertion-abuse';
import { coreQualityEmptyCatch } from './core-quality-empty-catch';
import { coreQualityLeftoverConsole } from './core-quality-leftover-console';
import { coreBugsTodoFixme } from './core-bugs-todo-fixme';
import { coreQualityAsyncWithoutAwait } from './core-quality-async-without-await';

export const PACK_NAME = 'core-quality' as const;

export const PACK_RULES: ReadonlyArray<Rule> = [
  coreTypescriptAsAny,
  coreBugsLooseEquality,
  coreTypescriptNonNullAssertionAbuse,
  coreQualityEmptyCatch,
  coreQualityLeftoverConsole,
  coreBugsTodoFixme,
  coreQualityAsyncWithoutAwait,
];

export function registerInto(register: (packName: string, rules: ReadonlyArray<Rule>) => void): void {
  register(PACK_NAME, PACK_RULES);
}
