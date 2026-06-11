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
import Image from 'next/image';
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
      { href: '/docs/github-action',    label: 'GitHub Action' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/docs/security-gate',    label: 'CI security gate' },
      { href: '/docs/limitations',      label: 'Limitations' },
      { href: '/docs/contributing',     label: 'Contributing' },
    ],
  },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  const ruleIds = listRuleIds();
  return (
    <div className="min-h-screen bg-surface-950 text-surface-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-surface-950/65 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
          <Link href="/" aria-label="CodeMore home" className="flex items-center gap-2.5">
            <Image src="/icon.svg" alt="" width={28} height={28} priority />
            <span className="font-display text-[16px] font-bold tracking-tight text-surface-50">
              Code<span className="text-brand-400">More</span>
              <span className="ml-2 font-mono text-[11px] font-normal tracking-[0.18em] text-surface-500 uppercase">docs</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-5 font-mono text-[12px] text-surface-400">
            <Link href="/docs/rules" className="hover:text-surface-100">rules ({ruleIds.length})</Link>
            <Link href="/" className="hover:text-surface-100">↗ home</Link>
            <a className="hover:text-surface-100" href="https://github.com/codemore-dev/codemore" target="_blank" rel="noreferrer">github</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-24 space-y-7 text-sm">
            {SECTIONS.map(s => (
              <div key={s.heading}>
                <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-400/70">
                  {s.heading}
                </div>
                <ul className="space-y-0.5">
                  {s.items.map(i => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className="block rounded-md px-2 py-1.5 text-[13.5px] text-surface-300 transition hover:bg-white/[0.03] hover:text-surface-50"
                      >
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-400/70">
                Rules
              </div>
              <ul className="space-y-0.5">
                {ruleIds.map(id => (
                  <li key={id}>
                    <Link
                      href={`/docs/rules/${id}`}
                      className="block truncate rounded-md px-2 py-1 font-mono text-[11.5px] text-surface-400 transition hover:bg-white/[0.03] hover:text-surface-100"
                    >
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>
        <main id="main" className="prose prose-invert prose-zinc min-w-0 flex-1 max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
