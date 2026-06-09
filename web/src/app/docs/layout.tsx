/**
 * Docs layout — sidebar + content.
 *
 * Routes:
 *   /docs                       → landing
 *   /docs/install               → install matrix
 *   /docs/rules                 → rule index
 *   /docs/rules/<rule-id>       → per-rule page (markdown auto-rendered)
 *   /docs/schema                → report schema reference
 *   /docs/contributing          → links to CONTRIBUTING / CONTRIBUTING-RULES
 *   /docs/external-tools        → external-tool adapter reference
 *
 * The pages-source layer reads from `docs/rules/*.md` at build time via
 * scripts/build-rule-pages.js (Phase 5 plan); v1 here renders any
 * `docs/rules/*.md` that exists in the repo without requiring a build step.
 */

import Link from 'next/link';
import { listRuleIds } from '@/lib/docs';
import type { ReactNode } from 'react';

const SECTIONS: Array<{ heading: string; items: Array<{ href: string; label: string }> }> = [
  {
    heading: 'Getting started',
    items: [
      { href: '/docs',                  label: 'Overview' },
      { href: '/docs/install',          label: 'Install' },
      { href: '/docs/schema',           label: 'Report schema' },
      { href: '/docs/external-tools',   label: 'External tools' },
      { href: '/docs/contributing',     label: 'Contributing' },
    ],
  },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  const ruleIds = listRuleIds();
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/docs" className="font-mono text-base font-semibold">
            CodeMore <span className="text-zinc-500">docs</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/docs/rules" className="hover:underline">Rules ({ruleIds.length})</Link>
            <a className="hover:underline" href="https://github.com/K0802s/codemore-vscode">GitHub</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-8 space-y-6 text-sm">
            {SECTIONS.map(s => (
              <div key={s.heading}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {s.heading}
                </div>
                <ul className="space-y-1">
                  {s.items.map(i => (
                    <li key={i.href}>
                      <Link href={i.href} className="block py-1 hover:underline">{i.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Rules
              </div>
              <ul className="space-y-1">
                {ruleIds.map(id => (
                  <li key={id}>
                    <Link
                      href={`/docs/rules/${id}`}
                      className="block truncate py-1 font-mono text-xs hover:underline"
                    >
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>
        <main className="prose prose-zinc dark:prose-invert min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
