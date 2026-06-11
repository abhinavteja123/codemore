"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

/**
 * LimitationsTerminal — the "honesty as flex" section.
 *
 * Renders as a monospace `cat docs/limitations.md` block. Each line fades
 * in with a 100ms stagger; the strike-through on each subject animates
 * left-to-right after the line is in view.
 *
 * The vibe: we're confident enough to lead with what we DON'T catch.
 */

const LINES: Array<{ kill: string; rest: string }> = [
  { kill: "weak password policy",         rest: " — context-dependent; lives in app config." },
  { kill: "audit logging completeness",   rest: " — a content question, not a code shape." },
  { kill: "business logic flaws",         rest: " — depends on your invariants." },
  { kill: "race conditions",              rest: " — runtime concurrency, not static." },
  { kill: "open S3 / GCS buckets",        rest: " — live cloud state, not source." },
];

export function LimitationsTerminal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <div ref={ref}>
      <SpotlightCard
        glow="red"
        className="rounded-[18px]"
        innerClassName="p-0 bg-[#06091a]/85 backdrop-blur-md"
      >
        <div className="flex items-center gap-2 border-b border-white/[0.04] bg-black/15 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 font-mono text-[11px] tracking-[0.04em] text-surface-500">cat docs/limitations.md</span>
        </div>

        <pre className="overflow-x-auto px-6 py-7 font-mono text-[13.5px] leading-[1.85] text-surface-200">
          <span className="text-surface-500"># things CodeMore does NOT catch</span>{"\n"}
          <span className="text-surface-500"># (and the tool you should pair with instead)</span>{"\n\n"}
          {LINES.map((l, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="block"
            >
              <span className="text-rose-400/80">✗</span>{" "}
              <span className="relative inline-block text-surface-300">
                {l.kill}
                <motion.span
                  className="absolute left-0 top-1/2 h-[1px] bg-rose-500"
                  initial={{ width: "0%" }}
                  animate={inView ? { width: "100%" } : { width: "0%" }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.12, ease: "easeOut" }}
                />
              </span>
              <span className="text-surface-300">{l.rest}</span>
            </motion.span>
          ))}
          {"\n"}
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + LINES.length * 0.12 + 0.3 }}
            className="block text-surface-500"
          >
            # for the full honest list →
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + LINES.length * 0.12 + 0.45 }}
            className="block"
          >
            <Link href="/docs/limitations" className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300">
              cat docs/limitations.md
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </motion.span>
        </pre>
      </SpotlightCard>
    </div>
  );
}
