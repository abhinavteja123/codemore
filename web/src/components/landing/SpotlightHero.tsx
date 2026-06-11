"use client";

import { useRef, type ReactNode } from "react";
import { useMousePositionVars } from "@/lib/mouse-position";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * SpotlightHero — container that threads cursor position as CSS vars and
 * paints a soft radial glow that follows the mouse.
 *
 * The "follow" feels analog because we update via requestAnimationFrame
 * (single update per frame, not per mousemove event). On reduced motion we
 * skip the listener entirely and render a static centred glow so the
 * section still has visual weight.
 */
interface Props {
  children: ReactNode;
  className?: string;
}

export function SpotlightHero({ children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Only thread mouse-position when motion is allowed; the hook is a no-op
  // when ref is unused, but we skip wiring it altogether for clarity.
  useMousePositionVars(reduced ? { current: null } : ref);

  return (
    <div
      ref={ref}
      className={"relative isolate " + className}
      style={
        reduced
          ? { ["--mouse-x" as string]: "50%", ["--mouse-y" as string]: "30%" }
          : undefined
      }
    >
      {/* Spotlight glow — sits above the aurora, below content. Pointer events
          off so it never blocks selection / click. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 30%), " +
            "rgba(54, 170, 248, 0.16), transparent 60%)",
        }}
      />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
