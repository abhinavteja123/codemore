// False-positive fixture for core-security-eval
// None of these usages should be flagged.

// Good: structured parsing, no eval.
export function safeParseConfig(src: string): unknown {
  return JSON.parse(src);
}

// Good: comment that mentions eval must not trigger.
// We used to call eval(src) here but replaced it with JSON.parse.
export function withCommentMention(src: string): unknown {
  return JSON.parse(src);
}

// Good: a method named "evaluate" — the regex must not over-match.
export function evaluator(input: string): number {
  return Number(input);
}

// Good: an object property named eval (rare but legal). Property access
// is NOT a call, so the rule does not fire.
const dict = { eval: 'placeholder' };
export const value = dict.eval;
