"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Search, Brain, Wand2, CheckCircle2 } from "lucide-react";

const WebGLASTConnectionMesh = dynamic(
  () => import("@/components/landing/designed/WebGLASTConnectionMesh"),
  { ssr: false },
);

/**
 * Agentic fix-loop replay — a 4-stage scroll-driven storyline:
 *   Detect → Plan → Patch → Validated
 *
 * Reuses the existing AST-connection mesh as the ambient backdrop.
 * The left column shows the code editor mutating per stage; the right
 * column shows the planner / validator side. Scroll position within
 * the 280vh section track drives which stage is active.
 */

const STAGES = [
  {
    id: "detect",
    label: "Detect",
    icon: <Search className="w-4 h-4" />,
    rule: "core-security-sql-injection-concat · BLOCKER",
    code: `const q = \`SELECT * FROM users WHERE id = '\${id}'\`;
db.query(q);`,
    aside: "Two-pass detector: AST candidate (db.query + concat) → confirm pass (user input reachable). Confidence 0.92.",
  },
  {
    id: "plan",
    label: "Plan",
    icon: <Brain className="w-4 h-4" />,
    rule: "planner · agentic-fixer",
    code: `// strategy: bind id as a positional param
// db.query("SELECT … WHERE id = ?", [id])`,
    aside: "The planner reads the rule citation + evidence + framework set. Picks the parameter-binding fix template.",
  },
  {
    id: "patch",
    label: "Patch",
    icon: <Wand2 className="w-4 h-4" />,
    rule: "generator · sandbox apply",
    code: `db.query(
  "SELECT * FROM users WHERE id = ?",
  [id],
);`,
    aside: "Patch applied in a tempdir copy. Rule re-runs against the patched file — passes. File-scoped tests re-run.",
  },
  {
    id: "validated",
    label: "Validated",
    icon: <CheckCircle2 className="w-4 h-4" />,
    rule: "validator · 1 / 1 PASS",
    code: `✓ core-security-sql-injection-concat — cleared
✓ file-scoped tests — pass
→ patch staged · awaiting commit`,
    aside: "Loop terminates on first PASS. Up to 3 retries on failure; everything since the original detect rolls back if all fail.",
  },
];

export default function AgenticFixLoopReplay() {
  const sectionRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
        const p = Math.min(Math.max(-rect.top / trackLen, 0), 1);
        setProgress(p);
        const continuous = p * (STAGES.length - 1);
        const next = Math.min(STAGES.length - 1, Math.round(continuous));
        setStage(prev => (prev === next ? prev : next));
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={sectionRef} id="fix-loop" className="fix-loop">
      <div className="fix-loop__sticky">
        <div className="fix-loop__mesh" aria-hidden>
          <WebGLASTConnectionMesh />
        </div>
        <div className="fix-loop__veil" aria-hidden />

        <header className="fix-loop__head">
          <div className="eyebrow">agentic fixer · planner → generator → validator</div>
          <h2>Each finding closes a loop. Up to 3 retries, byte-validated.</h2>
        </header>

        <div className="fix-loop__stages">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={"fix-loop__stage " + (i === stage ? "is-active" : i < stage ? "is-done" : "")}
              onClick={() => {
                const el = sectionRef.current;
                if (!el) return;
                const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
                const target = i / (STAGES.length - 1);
                window.scrollTo({ top: el.offsetTop + target * trackLen, behavior: "smooth" });
              }}
            >
              <span className="fix-loop__stage-step">{String(i + 1).padStart(2, "0")}</span>
              <span className="fix-loop__stage-icon">{s.icon}</span>
              <span className="fix-loop__stage-label">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="fix-loop__grid">
          <div className="fix-loop__editor">
            <div className="fix-loop__editor-tab">
              <span className="fix-loop__editor-dot fix-loop__editor-dot--r" />
              <span className="fix-loop__editor-dot fix-loop__editor-dot--y" />
              <span className="fix-loop__editor-dot fix-loop__editor-dot--g" />
              <span className="fix-loop__editor-name">api/users/[id]/route.ts</span>
            </div>
            <pre className="fix-loop__editor-code">
              <code key={STAGES[stage].id}>{STAGES[stage].code}</code>
            </pre>
          </div>

          <div className="fix-loop__side">
            <div className="fix-loop__side-rule">
              {STAGES[stage].icon}
              <span>{STAGES[stage].rule}</span>
            </div>
            <p className="fix-loop__side-aside" key={STAGES[stage].id + "-a"}>
              {STAGES[stage].aside}
            </p>
            <div className="fix-loop__side-progress">
              <div
                className="fix-loop__side-progress-bar"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
