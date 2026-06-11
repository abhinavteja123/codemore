"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useMotionValue } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * NumberCountUp — animates an integer (or % value) from 0 to `to` once the
 * element scrolls into view. Uses framer-motion's `animate` so the curve is
 * `easeOut` and respects browser frame budget.
 *
 * Reduced motion: renders the final value on mount, no tween.
 *
 * The `suffix` slot (e.g. "%") sits in a relatively smaller weight to keep
 * the numeral typographically dominant.
 */

interface Props {
  to: number;
  suffix?: string;
  duration?: number;
  className?: string;
}

export function NumberCountUp({ to, suffix = "", duration = 1.6, className = "" }: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  const mv = useMotionValue(reduced ? to : 0);
  const [display, setDisplay] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(mv, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, mv, to, duration, reduced]);

  return (
    <span ref={ref} className={"tabular-nums " + className}>
      {display}
      {suffix && (
        <span className="ml-0.5 font-display text-[0.65em] font-semibold text-surface-300">
          {suffix}
        </span>
      )}
    </span>
  );
}
