/* codemore-ignore-file: core-bugs-todo-fixme */
/* This rule source documents the TODO/FIXME/XXX/HACK keywords it catches;
   the docstring legitimately uses them as examples. */

/**
 * Rule: core-quality-empty-catch
 *
 * Detects `catch (...) { }` with an empty body — the catch swallows
 * the error and continues with whatever surrounding state. This is
 * one of the highest-signal quality smells: the developer caught the
 * error to satisfy the type system or linter without actually handling it.
 *
 * Severity: MAJOR. Empty catches reliably hide real bugs (failed
 * fetches, write errors) until they manifest as silent-data-loss in
 * production.
 *
 * Coverage:
 *   - `catch { }` (no binding) and `catch (e) { }` both fire.
 *   - Whitespace and newlines inside `{ }` are tolerated.
 *   - Block comments are stripped before matching — `catch { /* TODO *\/ }`
 *     also fires (the comment doesn't change behaviour at runtime).
 *
 * Coverage gap:
 *   - We don't catch a catch block that calls something but does NOT
 *     log or rethrow (e.g. `catch (e) { x++; }`). v1.1 will inspect
 *     for "no log, no rethrow, no return" patterns.
 */

/* codemore-ignore-file: core-quality-empty-catch */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// `catch (optional-binding) { whitespace-only }`
const EMPTY_CATCH_RE = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function stripCommentsAndStrings(content: string): string {
  let out = content.replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
  out = out.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, m => ' '.repeat(m.length));
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, m => ' '.repeat(m.length));
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, m => m.replace(/[^\n]/g, ' '));
  return out;
}

export const coreQualityEmptyCatch: Rule = {
  id: 'core-quality-empty-catch',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.9,
  title: 'Empty catch block silently swallows errors',
  whyItMatters:
    'An empty catch turns every failure inside the try into a silent no-op. The next time the ' +
    'inner code throws — a network failure, an unexpected null, a write that returned EACCES — ' +
    'execution continues as if everything succeeded. The exact bug class that produces silent ' +
    'data loss in production. AI tools insert empty catches to satisfy lints or types without ' +
    'thinking about the actual failure mode.',
  citation: 'https://codemore.dev/rules/core-quality-empty-catch',

  detect(ctx: RuleContext): RuleFinding[] {
    const sanitized = stripCommentsAndStrings(ctx.content);
    const findings: RuleFinding[] = [];

    EMPTY_CATCH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMPTY_CATCH_RE.exec(sanitized)) !== null) {
      const line = lineForOffset(ctx.content, m.index);
      findings.push({
        evidence: {
          file: ctx.filePath,
          line,
          column: 1,
          snippet: (ctx.lines[line - 1] ?? '').trim(),
          matchedPattern: 'empty-catch-block',
        },
        suggestedFix: {
          type: 'code-patch',
          instructions:
            'Decide what the error means here and do one of:\n\n' +
            '  // (a) Log the failure with context (most common)\n' +
            '  catch (err) {\n' +
            '    logger.warn({ err: sanitize(err) }, "failed to <action>");\n' +
            '  }\n\n' +
            '  // (b) Re-throw with extra context if the caller should see it\n' +
            '  catch (err) {\n' +
            '    throw new Error(`<action> failed for <id>`, { cause: err });\n' +
            '  }\n\n' +
            '  // (c) Fall back to a default deliberately, with a comment\n' +
            '  catch (err) {\n' +
            '    // expected when X — fall back to default\n' +
            '    return defaultValue;\n' +
            '  }\n\n' +
            'If you really do want to swallow the error (rare), suppress with a comment that ' +
            'documents which exceptions you expect and why ignoring them is safe.',
          verificationCriteria: [
            'The catch block now logs the error, rethrows, or returns a deliberate fallback with a comment',
            'OR the catch is suppressed inline with a comment explaining the trust assumption',
            're-scan reports core-quality-empty-catch resolved for this catch',
          ],
        },
      });
    }
    return findings;
  },
};
