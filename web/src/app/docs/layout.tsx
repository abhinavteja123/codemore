/**
 * Docs layout — 3-column on lg+ (sidebar L, prose centre, sticky TOC R).
 *
 * Sources of truth:
 *   - Sidebar entries: hardcoded SECTIONS array below + dynamic rule list.
 *   - Right-rail TOC: <StickyTOC> reads h2/h3 from the prose container at runtime.
 *   - Ambient backdrop: the same WebGLASTConnectionMesh the landing uses, at 5% opacity.
 *
 * Routes covered:
 *   /docs                       → landing
 *   /docs/install               → install matrix (surface-tabs)
 *   /docs/rules                 → rule index (card grid)
 *   /docs/rules/<rule-id>       → per-rule page (markdown renderer)
 *   /docs/schema                → report schema
 *   /docs/contributing          → contribution paths
 *   /docs/external-tools        → external-tool adapters
 *   /docs/github-action         → CI integration
 *   /docs/security-gate         → layered scan template
 *   /docs/limitations           → honest exclusions
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { listRuleIds } from "@/lib/docs";
import Breadcrumb from "@/components/docs/Breadcrumb";
import StickyTOC from "@/components/docs/StickyTOC";
import NavInstallDropdown from "@/components/landing/NavInstallDropdown";

const WebGLASTConnectionMesh = dynamic(
  () => import("@/components/landing/designed/WebGLASTConnectionMesh"),
  { ssr: false },
);

const SECTIONS: Array<{ heading: string; items: Array<{ href: string; label: string }> }> = [
  {
    heading: "Getting started",
    items: [
      { href: "/docs",                label: "Overview" },
      { href: "/docs/install",        label: "Install" },
      { href: "/docs/schema",         label: "Report schema" },
      { href: "/docs/external-tools", label: "External tools" },
      { href: "/docs/github-action",  label: "GitHub Action" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/docs/security-gate",  label: "CI security gate" },
      { href: "/docs/limitations",    label: "Limitations" },
      { href: "/docs/contributing",   label: "Contributing" },
    ],
  },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  const ruleIds = listRuleIds();
  return (
    <div className="docs-shell min-h-screen bg-[var(--ink)] text-[var(--fg)]">
      <div className="docs-shell__ambient" aria-hidden>
        <WebGLASTConnectionMesh />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-[#04040a]/65 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
          <Link href="/" aria-label="CodeMore home" className="flex items-center gap-2.5">
            <span
              className="relative inline-block h-6 w-6 rounded-full"
              style={{
                background:
                  "conic-gradient(from 220deg, rgba(78,242,202,0.25), rgba(131,110,243,0.25), rgba(235,126,179,0.25), #4ef2ca, rgba(78,242,202,0.25))",
                boxShadow: "0 0 12px rgba(78, 242, 202, 0.3)",
              }}
            >
              <span className="absolute inset-1.5 rounded-full bg-[#04040a]" />
            </span>
            <span className="font-display text-[15px] font-bold tracking-[0.2em] text-white">
              CODEMORE
              <span className="ml-2 font-mono text-[11px] font-normal tracking-[0.18em] text-zinc-500 uppercase">
                docs
              </span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-5 font-mono text-[12px] text-zinc-400">
            <Link href="/docs/rules" className="hover:text-white">rules ({ruleIds.length})</Link>
            <NavInstallDropdown />
            <Link href="/" className="hover:text-white">↗ home</Link>
            <a className="hover:text-white" href="https://github.com/abhinavteja123/codemore" target="_blank" rel="noreferrer">
              github
            </a>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-7 text-sm">
            {SECTIONS.map(s => (
              <div key={s.heading}>
                <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold-soft)]">
                  {s.heading}
                </div>
                <ul className="space-y-0.5">
                  {s.items.map(i => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className="block rounded-md px-2 py-1.5 text-[13px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                      >
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold-soft)]">
                Rules ({ruleIds.length})
              </div>
              <ul className="space-y-0.5 max-h-[40vh] overflow-y-auto pr-1">
                {ruleIds.map(id => (
                  <li key={id}>
                    <Link
                      href={`/docs/rules/${id}`}
                      className="block truncate rounded-md px-2 py-1 font-mono text-[11px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-100"
                    >
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>

        <main id="main" className="docs-prose prose prose-invert prose-zinc min-w-0 max-w-none">
          <Breadcrumb />
          {children}
        </main>

        <aside className="hidden lg:block">
          <StickyTOC />
        </aside>
      </div>
    </div>
  );
}
