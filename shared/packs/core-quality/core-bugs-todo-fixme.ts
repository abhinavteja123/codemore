/* codemore-ignore-file: core-bugs-todo-fixme */
/* This rule source documents the TODO/FIXME/XXX/HACK keywords it catches;
   the docstring legitimately uses them as examples. */

/**
 * Rule: core-bugs-todo-fixme
 *
 * Surfaces TODO / FIXME / XXX / HACK comments as INFO findings. Pure
 * inventory rule — every team has these, every team also forgets they
 * exist until something blows up against the deferred work.
 *
 * Severity: INFO. Never blocks; lets reviewers see the inventory in
 * the report.
 *
 * Coverage:
 *   - `// TODO ...`, `// FIXME ...`, `// XXX ...`, `// HACK ...`
 *   - `/* TODO ... *\/`, `/* FIXME ... *\/` block comments
 *   - `# TODO ...`, `# FIXME ...` in Python / shell / yaml
 *   - `-- TODO ...`, `-- FIXME ...` in SQL
 *   - Case-insensitive on the keyword.
 *
 * Coverage gap:
 *   - We don't track ownership (`TODO(alice):`), priority, or due date.
 *     The finding includes the rest of the comment line as the snippet
 *     so reviewers can scan the inventory in the report.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// One regex per comment leader. Each captures the keyword and the trailing
// text so the report shows what the TODO is about.
const PATTERNS: ReadonlyArray<{ re: RegExp; leader: string }> = [
  { re: /\/\/\s*(TODO|FIXME|XXX|HACK)\b\s*:?\s*([^\n]*)/gi, leader: '//' },
  { re: /\/\*\s*(TODO|FIXME|XXX|HACK)\b\s*:?\s*([\s\S]*?)\*\//g,  leader: '/*' },
  { re: /(?:^|\s)#\s*(TODO|FIXME|XXX|HACK)\b\s*:?\s*([^\n]*)/gi, leader: '#'  },
  { re: /--\s*(TODO|FIXME|XXX|HACK)\b\s*:?\s*([^\n]*)/gi,  leader: '--' },
];

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const coreBugsTodoFixme: Rule = {
  id: 'core-bugs-todo-fixme',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python', 'shell', 'yaml', 'sql', 'env', 'markdown', 'json'],
  category: 'maintainability',
  defaultSeverity: 'INFO',
  defaultConfidence: 1.0,
  title: 'TODO / FIXME / XXX / HACK comment',
  whyItMatters:
    'Every team has TODO and FIXME notes; every team also forgets they exist until production ' +
    'hits the deferred work. Surfacing the inventory at INFO level lets reviewers see what is ' +
    'sitting in the codebase without blocking merges. AI-generated code adds these at a high ' +
    'rate when the LLM hits a "this might need more thought" branch — many of them are real ' +
    'open questions that should be tracked or resolved before launch.',
  citation: 'https://codemore.dev/rules/core-bugs-todo-fixme',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    const seen = new Set<string>();         // dedupe (offset, leader)

    for (const { re, leader } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const keyword = m[1].toUpperCase();
        const tail = (m[2] ?? '').trim().replace(/\s+/g, ' ');
        const key = `${m.index}:${leader}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const line = lineForOffset(ctx.content, m.index);
        const snippetText = tail.length > 0 ? `${keyword}: ${tail.slice(0, 80)}` : keyword;
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: snippetText,
            matchedPattern: `${leader}-${keyword.toLowerCase()}`,
          },
          whyItMatters: `${keyword} note: ${tail.slice(0, 120) || '(no description)'}`,
          suggestedFix: {
            type: 'manual',
            instructions:
              'Decide one of three for each finding:\n' +
              '  (a) Resolve the work now — small enough to inline-fix.\n' +
              '  (b) Track it externally — create an issue, replace the comment with a link.\n' +
              '  (c) Keep as-is — add a clarifying comment if the intent is non-obvious.',
            verificationCriteria: [
              'The comment is either resolved, linked to an issue, or rewritten with clear context',
              'Re-scan reports the finding resolved OR the new comment intentionally remains',
            ],
          },
        });
      }
    }

    return findings;
  },
};
