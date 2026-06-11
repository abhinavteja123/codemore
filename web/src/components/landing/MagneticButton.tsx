"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * MagneticButton — primary CTA that subtly attracts the cursor within
 * ~80px. The translation is sprung so the motion feels analog, not linear.
 *
 * Reduced motion: no attraction. Click + focus behaviour unchanged.
 */

interface Props {
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "acid";
  className?: string;
  children: ReactNode;
}

const VARIANTS: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "bg-brand-500 text-surface-950 hover:bg-brand-400 shadow-glow-brand " +
    "active:scale-[0.98]",
  ghost:
    "border border-white/[0.08] bg-surface-900/60 text-surface-100 backdrop-blur-md " +
    "hover:border-brand-500/40 hover:bg-surface-800/60 active:scale-[0.98]",
  acid:
    "bg-acid-500 text-surface-950 hover:bg-acid-400 shadow-glow-acid active:scale-[0.98]",
};

export function MagneticButton({
  href, onClick, variant = "primary", className = "", children,
}: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  function onMove(e: React.MouseEvent) {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > 80) {
      x.set(0); y.set(0);
      return;
    }
    const intensity = 1 - dist / 80;
    x.set(dx * 0.25 * intensity);
    y.set(dy * 0.25 * intensity);
  }

  function onLeave() {
    x.set(0); y.set(0);
  }

  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-semibold tracking-tight transition-colors " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400";

  const Tag = (href ? motion.a : motion.button) as typeof motion.a;
  const props: Record<string, unknown> = href ? { href } : { onClick };

  return (
    <motion.span
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <Tag
        ref={ref as React.RefObject<HTMLAnchorElement>}
        className={base + " " + VARIANTS[variant] + " " + className}
        {...props}
      >
        {children}
      </Tag>
    </motion.span>
  );
}
