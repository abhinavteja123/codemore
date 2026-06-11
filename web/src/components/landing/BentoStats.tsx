"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { NumberCountUp } from "./NumberCountUp";

/**
 * BentoStats — asymmetric stat bento.
 *
 * Replaces the equal-height 3-column grid that screamed AI-generated. One
 * 2× hero stat with a sparkline animation, two stacked side stats. Each
 * card has a glow color tied to its data source so they read as distinct
 * findings, not as a marketing graphics set.
 *
 * On intersection: numbers count-up, sparkline draws in, cards fade-up.
 */

function Sparkline() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  // 16-point series — values chosen to look like a security-finding curve.
  const points = [4, 6, 5, 8, 12, 11, 14, 18, 22, 24, 27, 30, 33, 37, 39, 42];
  const d = points
    .map((y, i) => `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * 320} ${72 - y * 1.4}`)
    .join(" ");
  return (
    <svg
      ref={ref}
      viewBox="0 0 320 72"
      className="h-[72px] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="72">
          <stop offset="0%"   stopColor="rgb(20,184,166)" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="rgb(20,184,166)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <motion.path
        d={`${d} L 320 72 L 0 72 Z`}
        fill="url(#sparkfill)"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      />
      <motion.path
        d={d}
        stroke="rgb(45, 212, 191)"
        strokeWidth="1.5"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      />
      {points.map((y, i) => (
        <motion.circle
          key={i}
          cx={(i / (points.length - 1)) * 320}
          cy={72 - y * 1.4}
          r={1.5}
          fill="rgb(45, 212, 191)"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.2, delay: 0.4 + i * 0.04 }}
        />
      ))}
    </svg>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0 },
};

export function BentoStats() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ staggerChildren: 0.12 }}
      className="grid grid-cols-1 gap-5 lg:grid-cols-5"
    >
      {/* HERO STAT — Symbiotic. 3/5 width with sparkline. */}
      <motion.div variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="lg:col-span-3">
        <SpotlightCard glow="teal" innerClassName="p-7">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[80px] font-bold leading-none tracking-[-0.04em] text-surface-50">
              <NumberCountUp to={98} suffix="%" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-teal-400/80">
              Symbiotic · 2025
            </span>
          </div>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-surface-200">
            of <strong className="text-surface-50">1,072 scanned vibe-coded sites</strong> shipped with
            at least one security flaw. Most had four or more.
          </p>
          <div className="mt-6">
            <Sparkline />
          </div>
        </SpotlightCard>
      </motion.div>

      {/* SIDECARS — Veracode + DEV. Stacked, 2/5 width. */}
      <div className="flex flex-col gap-5 lg:col-span-2">
        <motion.div variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <SpotlightCard glow="brand" innerClassName="p-6">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[56px] font-bold leading-none tracking-[-0.03em] text-surface-50">
                <NumberCountUp to={45} suffix="%" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-400/80">
                Veracode · 2025–26
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-surface-300">
              of AI-generated code carries an OWASP Top-10 vuln.
            </p>
          </SpotlightCard>
        </motion.div>

        <motion.div variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <SpotlightCard glow="fuchsia" innerClassName="p-6">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[56px] font-bold leading-none tracking-[-0.03em] text-surface-50">
                <NumberCountUp to={70} suffix="%" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fuchsia-400/80">
                DEV · 2025
              </span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-surface-300">
              of audited Lovable apps shipped with Supabase RLS turned off.
            </p>
          </SpotlightCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
