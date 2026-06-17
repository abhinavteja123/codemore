"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal, Boxes, Code2, Check } from "lucide-react";

/**
 * Side-by-side proof that the CLI, MCP and VS Code surfaces emit the same
 * codemore-report.json bytes for the same scan — same fingerprint, same
 * issue count. Each column types out in sequence as the section scrolls
 * into view; the matching hash line confirms once all three settle.
 */

const REPORT_SNIPPET = `{
  "schemaVersion": "1.0.0",
  "tool": { "name": "codemore", "version": "0.2.1" },
  "summary": {
    "issuesTotal": 224,
    "bySeverity": { "BLOCKER": 5, "MAJOR": 47 }
  },
  "fingerprint": "sha256:7f95f2c62e0d3ecea6f23…"
}`;

const HASH = "sha256:7f95f2c62e0d3ecea6f23a4d8c1b2e7f0a9d6c3b5e8f1a4d7c0b3e6f9a2d5c8b1";

const SURFACES = [
  { id: "cli", label: "CLI",        sublabel: "$ codemore scan .",                icon: <Terminal className="w-3.5 h-3.5" /> },
  { id: "mcp", label: "MCP server", sublabel: "scan_project()",                   icon: <Boxes className="w-3.5 h-3.5" /> },
  { id: "ext", label: "VS Code",    sublabel: "Open Code Quality Dashboard",       icon: <Code2 className="w-3.5 h-3.5" /> },
];

export default function SurfaceParityDemo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [text, setText] = useState(["", "", ""]);
  const [hashed, setHashed] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) setActive(true);
      }),
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i++;
      const next = Math.min(i, REPORT_SNIPPET.length);
      setText([
        REPORT_SNIPPET.slice(0, Math.max(0, next - 8)),
        REPORT_SNIPPET.slice(0, Math.max(0, next - 4)),
        REPORT_SNIPPET.slice(0, next),
      ]);
      if (next < REPORT_SNIPPET.length) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => setHashed(true), 320);
      }
    };
    requestAnimationFrame(tick);
    return () => { cancelled = true; };
  }, [active]);

  return (
    <section className="surface-parity" ref={sectionRef}>
      <div className="surface-parity__inner">
        <header className="surface-parity__head reveal">
          <div className="eyebrow">parity proof · 3 surfaces · 1 schema</div>
          <h2>Same scan. Same report. Same byte.</h2>
          <p>
            CLI, MCP server, VS Code extension — all three call the same
            registry, emit the same <code>codemore-report.json</code> v1.0.0,
            and produce the same fingerprint. Agents never have to learn a
            second shape.
          </p>
        </header>

        <div className="surface-parity__cols">
          {SURFACES.map((s, i) => (
            <div key={s.id} className="surface-parity__col">
              <div className="surface-parity__col-head">
                <span className="surface-parity__col-icon">{s.icon}</span>
                <span className="surface-parity__col-label">{s.label}</span>
                <span className="surface-parity__col-sub">{s.sublabel}</span>
              </div>
              <pre className="surface-parity__code">
                <code>{text[i]}</code>
                {active && text[i].length < REPORT_SNIPPET.length && (
                  <span className="surface-parity__caret" />
                )}
              </pre>
            </div>
          ))}
        </div>

        <div className={"surface-parity__hash " + (hashed ? "is-on" : "")}>
          <span className="surface-parity__hash-label">fingerprint</span>
          <code>{HASH}</code>
          <span className="surface-parity__hash-match">
            {hashed && <Check className="w-3.5 h-3.5" />} matches all 3
          </span>
        </div>
      </div>
    </section>
  );
}
