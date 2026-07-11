/**
 * Docs loader.
 *
 * Reads the markdown files committed under the repo's top-level
 * `docs/rules/` and exposes:
 *   - `listRuleIds()` → sorted rule-id list (used by the sidebar).
 *   - `loadRuleDoc(id)` → raw markdown content for that rule.
 *   - `listDocPages()` → static doc pages outside the rules tree
 *      (currently: external-tools, github-action).
 *   - `loadDocPage(slug)` → raw markdown for a non-rule page.
 *
 * Path resolution: the docs/ tree sits at the repo root. From this
 * file at web/src/lib/docs.ts, the repo root is `../../../`.
 */

import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const RULES_DIR = path.join(REPO_ROOT, 'docs', 'rules');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');

let ruleIdsCache: string[] | null = null;
function ensureRuleIds(): string[] {
  if (ruleIdsCache) return ruleIdsCache;
  let entries: string[] = [];
  try { entries = fs.readdirSync(RULES_DIR); }
  catch { return (ruleIdsCache = []); }
  ruleIdsCache = entries
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort();
  return ruleIdsCache;
}

export function listRuleIds(): string[] {
  return ensureRuleIds();
}

export function loadRuleDoc(id: string): string | null {
  if (!ensureRuleIds().includes(id)) return null;
  const p = path.join(RULES_DIR, `${id}.md`);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return null; }
}

const STATIC_PAGES: ReadonlyArray<{ slug: string; file: string; title: string }> = [
  { slug: 'external-tools', file: 'external-tools.md', title: 'External tool adapters' },
  { slug: 'github-action',  file: 'github-action.md',  title: 'GitHub Action' },
  { slug: 'limitations',    file: 'limitations.md',    title: 'Limitations' },
  { slug: 'security-gate',  file: 'security-gate.md',  title: 'Security gate' },
];

export function listDocPages() {
  return STATIC_PAGES.filter(p => {
    try { return fs.statSync(path.join(DOCS_DIR, p.file)).isFile(); }
    catch { return false; }
  });
}

export function loadDocPage(slug: string): { title: string; content: string } | null {
  const entry = STATIC_PAGES.find(p => p.slug === slug);
  if (!entry) return null;
  try {
    const content = fs.readFileSync(path.join(DOCS_DIR, entry.file), 'utf8');
    return { title: entry.title, content };
  } catch {
    return null;
  }
}
