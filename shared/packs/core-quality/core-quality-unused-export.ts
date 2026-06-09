/**
 * Rule: core-quality-unused-export
 *
 * Detects `export` declarations whose exported name is not referenced by
 * any `import { Name }` anywhere else in the project. Cross-file pivot
 * debris: a feature was rewired or removed, the surrounding callers were
 * deleted, but the export was forgotten.
 *
 * Severity: MAJOR (experimental).
 *   The risk isn't the unused export itself — it's that the export name
 *   often holds OLD security logic (legacy `checkAdmin`, prior `validate`,
 *   forgotten `oldRoleCheck`) that the AI may try to re-import when
 *   working on a future fix, locking in the obsolete behaviour.
 *
 * Detection (uses ProjectIndex.allImportedNames):
 *   - For each `export` declaration in the file, get the exported name.
 *   - If `projectIndex.allImportedNames` does NOT include that name,
 *     emit a finding pointing at the export.
 *
 * Skip rules (kept generous to stay quiet on false positives):
 *   - Entry-point files (`index.ts`, `route.ts`, `page.tsx`, `layout.tsx`,
 *     `middleware.ts`, `main.ts`, `server.ts`, `cli.ts`, anything matched
 *     by Next.js / Vite / framework conventions). Their exports are
 *     consumed by a framework runtime, not by other source files.
 *   - `export default` — many bundlers don't import default by name, so
 *     a default-export "unused" signal is too noisy without full module
 *     graph resolution.
 *   - Re-exports (`export { X } from './Y'`) — these forward by name and
 *     don't introduce an "owned" export here.
 *   - Names prefixed with `_` (TS convention for deliberately unused).
 *
 * Coverage gap:
 *   - Name-collision is the most common false negative: if `Foo` is
 *     exported from two files and only one is consumed, both stay
 *     marked "used". This is the safe direction (under-report rather
 *     than over-report) until full module-graph resolution lands.
 *   - Dynamic imports (`import('./x').then(m => m.Foo)`) are NOT tracked.
 *   - Imports via path aliases that change the binding name (rare) are
 *     covered because we record both the local alias and the original
 *     name from the ImportSpecifier.
 */

import * as ts from 'typescript';
import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

/** Files whose exports go to a framework runtime, not other source files. */
const ENTRY_BASENAMES = new Set([
  'index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs',
  'route.ts', 'route.tsx', 'route.js', 'route.jsx',
  'page.ts', 'page.tsx', 'page.js', 'page.jsx',
  'layout.ts', 'layout.tsx', 'layout.js', 'layout.jsx',
  'middleware.ts', 'middleware.tsx', 'middleware.js',
  'loading.ts', 'loading.tsx',
  'error.ts', 'error.tsx',
  'not-found.ts', 'not-found.tsx',
  'main.ts', 'main.tsx', 'main.js',
  'server.ts', 'server.js',
  'cli.ts', 'cli.js',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'tailwind.config.js', 'tailwind.config.ts',
  'vite.config.ts', 'vite.config.js',
  'astro.config.mjs', 'astro.config.ts',
  'svelte.config.js',
  'webpack.config.js', 'webpack.config.ts',
]);

function isEntryFile(relPath: string): boolean {
  const slash = relPath.lastIndexOf('/');
  const base = slash >= 0 ? relPath.slice(slash + 1) : relPath;
  if (ENTRY_BASENAMES.has(base)) return true;
  // Test files: their exports are consumed by the test runner.
  if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(base)) return true;
  return false;
}

interface ExportHit {
  name: string;
  line: number;
  column: number;
  start: number;
  end: number;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'let' | 'var';
}

function collectNamedExports(sf: ts.SourceFile): ExportHit[] {
  const out: ExportHit[] = [];
  const pos = (start: number): { line: number; column: number } => {
    const lc = sf.getLineAndCharacterOfPosition(start);
    return { line: lc.line + 1, column: lc.character + 1 };
  };
  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    const isExport = mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isDefault = mods?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (!isExport || isDefault) {
      // Also handle `export { X }` / `export { X } from 'y'`
      if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause) && !stmt.moduleSpecifier) {
        for (const spec of stmt.exportClause.elements) {
          const name = spec.name.text;
          const start = spec.name.getStart(sf);
          const { line, column } = pos(start);
          out.push({ name, line, column, start, end: spec.name.getEnd(), kind: 'const' });
        }
      }
      continue;
    }
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const start = stmt.name.getStart(sf);
      const { line, column } = pos(start);
      out.push({ name: stmt.name.text, line, column, start, end: stmt.name.getEnd(), kind: 'function' });
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      const start = stmt.name.getStart(sf);
      const { line, column } = pos(start);
      out.push({ name: stmt.name.text, line, column, start, end: stmt.name.getEnd(), kind: 'class' });
    } else if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
      const start = stmt.name.getStart(sf);
      const { line, column } = pos(start);
      out.push({ name: stmt.name.text, line, column, start, end: stmt.name.getEnd(), kind: 'interface' });
    } else if (ts.isTypeAliasDeclaration(stmt) && stmt.name) {
      const start = stmt.name.getStart(sf);
      const { line, column } = pos(start);
      out.push({ name: stmt.name.text, line, column, start, end: stmt.name.getEnd(), kind: 'type' });
    } else if (ts.isEnumDeclaration(stmt) && stmt.name) {
      const start = stmt.name.getStart(sf);
      const { line, column } = pos(start);
      out.push({ name: stmt.name.text, line, column, start, end: stmt.name.getEnd(), kind: 'enum' });
    } else if (ts.isVariableStatement(stmt)) {
      let kind: ExportHit['kind'] = 'var';
      const flags = stmt.declarationList.flags;
      if (flags & ts.NodeFlags.Const) kind = 'const';
      else if (flags & ts.NodeFlags.Let) kind = 'let';
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const start = decl.name.getStart(sf);
          const { line, column } = pos(start);
          out.push({ name: decl.name.text, line, column, start, end: decl.name.getEnd(), kind });
        }
      }
    }
  }
  return out;
}

export const coreQualityUnusedExport: Rule = {
  id: 'core-quality-unused-export',
  version: '1.0.0',
  pack: 'core-quality',
  lifecycle: 'experimental',
  languages: ['typescript', 'javascript'],
  category: 'bug',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.7,
  title: 'Exported binding is not imported anywhere in the project',
  whyItMatters:
    'An export that no other file imports is cross-file pivot debris: the caller was rewired ' +
    'or removed, the export was forgotten. The name often holds OLD security logic (legacy ' +
    'auth checks, prior validators, forgotten admin helpers) that the AI may try to re-import ' +
    'when working on a future fix, locking in obsolete behaviour. Delete the export or wire ' +
    'it back into a consumer.',
  citation: 'https://codemore.dev/rules/core-quality-unused-export',

  detect(ctx: RuleContext): RuleFinding[] {
    if (!ctx.sourceFile) return [];
    if (!ctx.projectIndex) return [];
    if (isEntryFile(ctx.filePath)) return [];

    const findings: RuleFinding[] = [];
    const imported = ctx.projectIndex.allImportedNames;
    for (const hit of collectNamedExports(ctx.sourceFile)) {
      if (hit.name.startsWith('_')) continue;
      if (imported.has(hit.name)) continue;
      findings.push({
        evidence: {
          file: ctx.filePath,
          line: hit.line,
          column: hit.column,
          snippet: (ctx.lines[hit.line - 1] ?? '').trim(),
          matchedPattern: `unused-export-${hit.kind}`,
        },
        whyItMatters:
          `\`export ${hit.kind} ${hit.name}\` is not imported by any other file in the project. ` +
          `Either delete it or wire it into the consumer that should use it.`,
        suggestedFix: {
          type: 'code-patch',
          instructions:
            `Two options for the unused \`${hit.name}\` export:\n\n` +
            `  // (a) Genuine pivot debris — drop the export.\n` +
            `  //   If nothing else references the binding in this file either, delete the\n` +
            `  //   whole declaration. (core-quality-unused-variable will catch any leftover.)\n\n` +
            `  // (b) The export is supposed to be consumed — find the call site that should\n` +
            `  //   import \`${hit.name}\` and add the import.\n\n` +
            `If the binding is part of a public package surface and consumers live OUTSIDE this ` +
            `repo, suppress with a Reason comment. Tools that publish library APIs (e.g. via ` +
            `\`exports\` in package.json) belong in this category — the rule deliberately doesn't ` +
            `parse package.json's "exports" field in v1.`,
          verificationCriteria: [
            `The unused export \`${hit.name}\` is either deleted OR an import statement adds it to a consumer`,
            `Re-scan reports core-quality-unused-export resolved for this line`,
          ],
        },
      });
    }
    return findings;
  },
};
