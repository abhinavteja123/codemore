"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * TerminalDemoPro — typewriter that "boots up" a real codemore scan trace.
 *
 * Lines are appended via requestAnimationFrame (not setTimeout-per-char) so
 * the timing tracks the browser's frame budget rather than fighting it. Each
 * line is syntax-coloured: command (cmd), info, ok, warn, err, agent.
 *
 * Reduced motion: prints the final state on mount, no cursor blink.
 *
 * What's intentional:
 *   - The "$" prompt sits in brand-cyan, not the white that most CLI mocks use
 *   - The agent-handoff line at the end is acid-lime — the second accent — so
 *     the visitor's eye is drawn to the "the agent reads this" payoff
 *   - Three real findings reference real CodeMore rule ids, not made-up bugs
 */

type LineKind = "cmd" | "info" | "ok" | "warn" | "err" | "agent";

interface Line {
  text: string;
  kind: LineKind;
  // Per-line typing speed bias. ms.
  pace?: number;
}

const SCRIPT: Line[] = [
  { text: "$ npx codemore@latest scan .",                          kind: "cmd",   pace: 22 },
  { text: "Indexing 247 files…",                                   kind: "info",  pace: 8 },
  { text: "✓ Parsed TypeScript + Python AST",                      kind: "ok",    pace: 8 },
  { text: "✓ Loaded 6 packs · 58 rules · 8 external adapters",     kind: "ok",    pace: 8 },
  { text: "✗ src/db/users.ts:42   core-security-sql-injection-concat", kind: "err",  pace: 6 },
  { text: "✗ .env.local:2          vibe-public-env-leak",          kind: "err",   pace: 6 },
  { text: "✗ .github/workflows/deploy.yml:13   vibe-cicd-secret-in-yaml", kind: "err", pace: 6 },
  { text: "⚠ src/lib/agent.ts:21   vibe-llm-output-to-sink",       kind: "warn",  pace: 6 },
  { text: "",                                                      kind: "info",  pace: 1 },
  { text: "150 issues · 51 BLOCKERs · 58/58 rules · score 54/100", kind: "info",  pace: 6 },
  { text: "→ codemore-report.json ready for your agent.",          kind: "agent", pace: 7 },
];

const COLOR: Record<LineKind, string> = {
  cmd:   "text-surface-50",
  info:  "text-surface-400",
  ok:    "text-emerald-400",
  warn:  "text-amber-300",
  err:   "text-rose-400",
  agent: "text-acid-400",
};

/** Render with mild syntax highlighting: file:line in monospace dim,
    rule ids in surface-100 italic. The prefix glyph keeps its line color. */
function renderLine(line: Line) {
  // Split out the leading glyph (✓ ✗ ⚠ $ →) and apply the line color to it;
  // try to spot `path:line` and `rule-id` substrings to elevate.
  const m = line.text.match(/^([$✓✗⚠→])\s+(.*)$/);
  if (!m) return <span>{line.text}</span>;

  const [, glyph, rest] = m;
  const findingMatch = rest.match(/^(\S+:\d+)\s+(\S+)$/);
  if (findingMatch) {
    const [, loc, rule] = findingMatch;
    return (
      <span>
        <span className={COLOR[line.kind]}>{glyph}</span>
        <span className="ml-2 text-surface-300">{loc}</span>
        <span className="ml-2 italic text-surface-100">{rule}</span>
      </span>
    );
  }

  return (
    <span>
      <span className={COLOR[line.kind]}>{glyph}</span>
      <span className="ml-2">{rest}</span>
    </span>
  );
}

export function TerminalDemoPro() {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<{ line: number; char: number }>(
    reduced ? { line: SCRIPT.length, char: 0 } : { line: 0, char: 0 }
  );
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    if (reduced) return;

    function tick(now: number) {
      setShown(prev => {
        if (prev.line >= SCRIPT.length) return prev;
        const line = SCRIPT[prev.line];
        const pace = line.pace ?? 8;
        const elapsed = now - (last.current || now);
        last.current = now;
        // Use elapsed budget — typing speed stays stable under heavy CPU.
        const budget = Math.max(1, Math.floor(elapsed / pace));
        const next = prev.char + budget;
        if (next >= line.text.length) {
          // Advance to next line; reset char counter; small pause.
          last.current = now - pace * 4;
          return { line: prev.line + 1, char: 0 };
        }
        return { line: prev.line, char: next };
      });
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [reduced]);

  return (
    <div className="rounded-[18px] border border-white/[0.06] bg-[#06091a]/85 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_64px_-24px_rgba(0,0,0,0.65)] overflow-hidden">
      {/* Title bar — three traffic-light dots + monospace path label */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] bg-[#0a0f24]/70 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]/85" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]/85" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]/85" />
        <span className="ml-3 font-mono text-[11px] tracking-[0.04em] text-surface-500">~/vibe-bad-app — codemore — 100×24</span>
      </div>

      <pre className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-[1.7]">
        {SCRIPT.map((line, i) => {
          if (i > shown.line) return null;
          // Partial line being typed: slice the text.
          if (i === shown.line) {
            const partial = { ...line, text: line.text.slice(0, shown.char) };
            return (
              <div key={i} className={COLOR[line.kind]}>
                {renderLine(partial)}
                {/* Solid block caret only on the currently-typing line. */}
                {!reduced && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 -translate-y-0.5 animate-live-pulse bg-brand-400 align-middle" />
                )}
              </div>
            );
          }
          // Fully revealed lines.
          return (
            <div key={i} className={COLOR[line.kind]}>
              {renderLine(line) || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
