"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Terminal, Boxes, Code2, Workflow, ArrowUpRight, Check, Copy } from "lucide-react";

/**
 * CommandTabs — surface picker styled like a command palette.
 *
 * Tabs:
 *   - Monospace labels with keyboard hints (⌘1, ⌘2, ⌘3, ⌘4)
 *   - The active-tab underline morphs between tabs via framer-motion `layoutId`
 *   - Keyboard shortcut: pressing ⌘1..⌘4 (Ctrl on Win/Linux) switches tabs
 *
 * Each tab shows:
 *   - A short "what it does" line
 *   - A copy-paste install command (with copy button + tick feedback)
 *   - A link to the full install guide
 */

interface Tab {
  id: string;
  label: string;
  Icon: typeof Terminal;
  desc: string;
  code: string;
  href: string;
}

const TABS: Tab[] = [
  {
    id: "cli",
    label: "CLI",
    Icon: Terminal,
    desc: "One command. Reports findings as stdout, JSON, or SARIF.",
    code: "npx codemore@latest scan .",
    href: "/docs/install#cli",
  },
  {
    id: "mcp",
    label: "MCP server",
    Icon: Boxes,
    desc: "Cursor · Claude Code · Codex read the report and apply fixes.",
    code: `// ~/.cursor/mcp.json
{
  "mcpServers": {
    "codemore": {
      "command": "npx",
      "args": ["-y", "codemore@latest", "serve-mcp"]
    }
  }
}`,
    href: "/docs/install#mcp",
  },
  {
    id: "vscode",
    label: "VS Code",
    Icon: Code2,
    desc: "Inline diagnostics. Quick-fix code actions via the agentic loop.",
    code: "code --install-extension codemore-0.2.0.vsix",
    href: "/docs/install#vscode",
  },
  {
    id: "gh",
    label: "GitHub Action",
    Icon: Workflow,
    desc: "PR-comment bot. Fails the build on new BLOCKERs since baseline.",
    code: `# .github/workflows/codemore.yml
- uses: abhinavteja123/codemore@main
  with:
    fail-on: BLOCKER`,
    href: "/docs/install#gh",
  },
];

export function CommandTabs() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const [copied, setCopied] = useState(false);
  const active = TABS.find(t => t.id === activeId)!;

  // ⌘1..⌘4 / Ctrl 1..4 — quick switch.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= TABS.length) {
        e.preventDefault();
        setActiveId(TABS[n - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(active.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/[0.06] bg-surface-900/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
      {/* Tab strip */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.04] bg-black/15 p-2">
        {TABS.map((t, i) => {
          const isActive = t.id === activeId;
          return (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={
                "relative inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-[12px] transition-colors " +
                (isActive ? "text-surface-50" : "text-surface-400 hover:text-surface-100")
              }
            >
              {isActive && (
                <motion.span
                  layoutId="tab-active"
                  className="absolute inset-0 -z-10 rounded-md bg-brand-500/15 ring-1 ring-brand-500/40"
                  transition={{ type: "spring", duration: 0.45, bounce: 0.18 }}
                />
              )}
              <t.Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
              <span className="ml-1 hidden text-[10px] text-surface-500 lg:inline">
                ⌘{i + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-7">
        <p className="text-[14.5px] leading-relaxed text-surface-200">{active.desc}</p>

        <div className="mt-5 group/code relative overflow-hidden rounded-lg border border-white/[0.06] bg-[#06091a]/85">
          <button
            onClick={copyCode}
            aria-label="Copy command"
            className="absolute right-2 top-2 z-10 rounded-md border border-white/[0.06] bg-surface-900/60 p-1.5 text-surface-400 backdrop-blur-sm transition hover:border-brand-500/40 hover:text-surface-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-acid-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.7] text-surface-100">{active.code}</pre>
        </div>

        <div className="mt-5 flex items-center justify-end">
          <Link
            href={active.href}
            className="group/link inline-flex items-center gap-1 font-mono text-[12px] text-brand-400 hover:text-brand-300"
          >
            full install guide
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
