"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

/**
 * HowItWorks — three-step flow with CUSTOM SVG glyphs (not Lucide).
 *
 * Each step:
 *   - Lifts on hover (4% via transform; glow halo intensifies)
 *   - Has its own glyph that strokes-in on intersection
 *   - Bound by a dashed line that draws between steps on intersection
 *
 * The glyphs are intentional:
 *   1. Aperture+chevron  — "scan" (a focused read)
 *   2. Brain-pulse + braces — "agent reads" (the report → agent handoff)
 *   3. Patch + check — "validated fix" (the loop closing)
 */

// ───── glyphs ──────────────────────────────────────────────────────────

function ScanGlyph({ inView }: { inView: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" fill="none" aria-hidden>
      {/* Outer aperture ring */}
      <motion.circle
        cx="18" cy="18" r="11"
        stroke="#36aaf8" strokeWidth="1.6"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Tick marks inside — three short strokes evoking a scope */}
      <motion.path
        d="M14 15 L17 15 M21 15 L24 15 M14 21 L24 21"
        stroke="#36aaf8" strokeWidth="1.4" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 0.8 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      />
      {/* Aperture handle */}
      <motion.path
        d="M26 26 L34 34"
        stroke="#36aaf8" strokeWidth="2.2" strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.45, delay: 0.65 }}
      />
    </svg>
  );
}

function AgentGlyph({ inView }: { inView: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" fill="none" aria-hidden>
      {/* Left brace */}
      <motion.path
        d="M10 12 Q6 12 6 16 L6 18 Q6 20 4 20 Q6 20 6 22 L6 24 Q6 28 10 28"
        stroke="#6366f1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      />
      {/* Right brace */}
      <motion.path
        d="M30 12 Q34 12 34 16 L34 18 Q34 20 36 20 Q34 20 34 22 L34 24 Q34 28 30 28"
        stroke="#6366f1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      />
      {/* Centre pulse — three concentric dots */}
      <motion.circle cx="20" cy="20" r="2" fill="#6366f1"
        initial={{ opacity: 0, scale: 0 }}
        animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, delay: 0.55 }}
      />
      <motion.circle cx="20" cy="20" r="4" stroke="#818cf8" strokeWidth="1.2" fill="none"
        initial={{ opacity: 0, scale: 0 }}
        animate={inView ? { opacity: 0.6, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      />
      <motion.circle cx="20" cy="20" r="6.5" stroke="#a5b4fc" strokeWidth="1" fill="none"
        initial={{ opacity: 0, scale: 0 }}
        animate={inView ? { opacity: 0.35, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, delay: 0.85 }}
      />
    </svg>
  );
}

function FixGlyph({ inView }: { inView: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" fill="none" aria-hidden>
      {/* Circle path */}
      <motion.circle
        cx="20" cy="20" r="14"
        stroke="#a3e635" strokeWidth="1.5"
        strokeDasharray="3 4"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 0.6 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Solid check inside */}
      <motion.path
        d="M13 21 L18 26 L28 14"
        stroke="#a3e635" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

// ───── connector ───────────────────────────────────────────────────────

function Connector({ inView, reverse = false }: { inView: boolean; reverse?: boolean }) {
  return (
    <div className="hidden lg:flex items-center justify-center h-full min-w-[40px] max-w-[80px]">
      <svg
        viewBox="0 0 80 12"
        className="pointer-events-none h-3 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <motion.line
          x1={reverse ? 80 : 0} y1="6"
          x2={reverse ? 0 : 80}  y2="6"
          stroke="rgba(54, 170, 248, 0.5)" strokeWidth="1" strokeDasharray="3 4"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
          transition={{ duration: 0.9, ease: "linear", delay: 0.6 }}
        />
      </svg>
    </div>
  );
}

// ───── step card ───────────────────────────────────────────────────────

interface Step {
  n: number;
  title: string;
  body: string;
  glyph: (inView: boolean) => React.ReactNode;
  glow: Parameters<typeof SpotlightCard>[0]["glow"];
}

const STEPS: Step[] = [
  {
    n: 1, title: "Scan",
    body: "The CLI / MCP / extension reads your repo, emits a codemore-report.json with every finding pinned to file + line + rule citation + fix template.",
    glyph: inView => <ScanGlyph inView={inView} />, glow: "brand",
  },
  {
    n: 2, title: "Agent reads",
    body: "Cursor · Claude Code · Codex consume the schema. Every issue carries enough context to plan a fix without re-reading the file.",
    glyph: inView => <AgentGlyph inView={inView} />, glow: "indigo",
  },
  {
    n: 3, title: "Validated fix",
    body: "Agent patches. Validator re-runs the rule and the file's tests. Loop closes on PASS — capped at three retries before bowing out.",
    glyph: inView => <FixGlyph inView={inView} />, glow: "acid",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <div ref={ref} className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
      {/* Step 1 */}
      <StepCard step={STEPS[0]} inView={inView} delay={0} />
      <Connector inView={inView} />
      {/* Step 2 — slightly elevated on desktop */}
      <StepCard step={STEPS[1]} inView={inView} delay={0.15} elevated />
      <Connector inView={inView} />
      <StepCard step={STEPS[2]} inView={inView} delay={0.3} />
    </div>
  );
}

function StepCard({ step, inView, delay, elevated = false }: {
  step: Step; inView: boolean; delay: number; elevated?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className={"group h-full" + (elevated ? " lg:-translate-y-2" : "")}
    >
      <SpotlightCard
        glow={step.glow}
        innerClassName="p-7"
        className="relative h-full transition-transform duration-300 ease-out group-hover:-translate-y-1"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-surface-500">
            Step 0{step.n}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
        </div>
        <div className="mt-5 flex items-start gap-4">
          <div className="relative flex-shrink-0">
            {/* Pulsing halo behind glyph */}
            <div
              className={`absolute inset-0 -m-2 rounded-full opacity-0 transition-all duration-500 ease-out group-hover:scale-125 group-hover:opacity-100 ` +
                (step.glow === "brand" ? "bg-brand-500/15 blur-[8px] ring-2 ring-brand-500/30" : "") +
                (step.glow === "indigo" ? "bg-indigo-500/15 blur-[8px] ring-2 ring-indigo-500/30" : "") +
                (step.glow === "acid" ? "bg-acid-500/15 blur-[8px] ring-2 ring-acid-500/30" : "")
              }
            />
            <div className="relative z-10 transition-transform duration-300 group-hover:scale-110">
              {step.glyph(inView)}
            </div>
          </div>
          <div>
            <h3 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-surface-50">
              {step.title}
            </h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-surface-300">{step.body}</p>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}
