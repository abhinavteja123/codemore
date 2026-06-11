"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * HeroLogo — the wedge mark, animated on page load.
 *
 * On first mount, the diagonal "wedge" line and the checkmark stroke draw
 * in via stroke-dashoffset animation (200ms + 240ms). The dot fades in as
 * the wedge completes (delay 320ms). Whole sequence is under 600ms so it's
 * done before tagline cascade begins (≈ 250ms after).
 *
 * Reduced motion: renders as the final static state.
 */
interface Props {
  size?: number;
  className?: string;
}

export function HeroLogo({ size = 56, className = "" }: Props) {
  const reduced = useReducedMotion();

  const strokeAnim = reduced
    ? { pathLength: 1 }
    : { pathLength: [0, 1] };
  const dotAnim = reduced
    ? { opacity: 1, scale: 1 }
    : { opacity: [0, 1], scale: [0.5, 1] };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="CodeMore"
      className={className}
      initial={false}
    >
      <defs>
        <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#36aaf8"/>
          <stop offset="100%" stopColor="#0c8ee9"/>
        </linearGradient>
        <linearGradient id="heroStroke" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.55"/>
        </linearGradient>
      </defs>

      <motion.rect
        x="0" y="0" width="48" height="48" rx="11"
        fill="url(#heroFill)"
        initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        style={{ transformOrigin: "24px 24px" }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      />

      <motion.path
        d="M11 11 L29 29"
        stroke="url(#heroStroke)"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
        initial={reduced ? false : { pathLength: 0 }}
        animate={strokeAnim}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      />

      <motion.path
        d="M16 33 L20 37 L37 20"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.9}
        initial={reduced ? false : { pathLength: 0 }}
        animate={strokeAnim}
        transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
      />

      <motion.circle
        cx="37" cy="11" r="3.2"
        fill="#ffffff"
        initial={reduced ? false : { opacity: 0, scale: 0.5 }}
        animate={dotAnim}
        style={{ transformOrigin: "37px 11px" }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1], delay: 0.42 }}
      />
    </motion.svg>
  );
}
