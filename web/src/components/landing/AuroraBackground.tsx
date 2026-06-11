"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * AuroraBackground — four drifting radial blurs that compose a gradient mesh.
 *
 * Each blob lives on its own keyframe loop (30s+) so the composite never
 * visibly repeats within a session. Pure CSS — no JS per frame. Sits BEHIND
 * the rest of the hero content, masked to the hero region by the parent.
 *
 * Reduced motion: blobs render in their initial position with animation paused.
 * The mesh is still visible — only the drift is suppressed.
 *
 * Implementation notes:
 *   - `mix-blend-screen` keeps the blobs additive over the dark base
 *   - `filter: blur(110px)` makes them feel atmospheric, not blocky
 *   - GPU compositing via `transform: translate3d` in the keyframes (see
 *     tailwind.config.ts aurora-{1..4})
 */
export function AuroraBackground() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Subtle vignette gradient — the always-on layer that grounds the aurora.
          Identical in both motion states so the page never looks broken. */}
      <div className="absolute inset-0 bg-hero-mesh" />

      {/* Four blobs, each on a different loop. Filter+blur is expensive; we
          GPU-promote with will-change so it doesn't trigger layout shifts. */}
      <div
        className={
          "absolute -top-32 left-[55%] h-[640px] w-[640px] rounded-full bg-brand-500/55 mix-blend-screen " +
          "[filter:blur(120px)] will-change-transform " +
          (reduced ? "" : "animate-aurora-1")
        }
      />
      <div
        className={
          "absolute top-[10%] left-[15%] h-[520px] w-[520px] rounded-full bg-indigo-500/45 mix-blend-screen " +
          "[filter:blur(110px)] will-change-transform " +
          (reduced ? "" : "animate-aurora-2")
        }
      />
      <div
        className={
          "absolute bottom-[-8%] left-[40%] h-[560px] w-[560px] rounded-full bg-fuchsia-500/30 mix-blend-screen " +
          "[filter:blur(130px)] will-change-transform " +
          (reduced ? "" : "animate-aurora-3")
        }
      />
      <div
        className={
          "absolute top-[35%] right-[-8%] h-[480px] w-[480px] rounded-full bg-teal-400/35 mix-blend-screen " +
          "[filter:blur(120px)] will-change-transform " +
          (reduced ? "" : "animate-aurora-4")
        }
      />
    </div>
  );
}
