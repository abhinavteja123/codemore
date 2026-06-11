"use client";

import { useEffect, useRef } from "react";

/**
 * Threads the mouse position as CSS custom properties on the given element.
 * Throttled to one update per `requestAnimationFrame` so layout/paint cost
 * stays at zero per frame above the browser baseline.
 *
 * Usage in a parent client component:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useMousePositionVars(ref);
 *   return <div ref={ref} className="[--mouse-x:50%] [--mouse-y:50%]">…</div>
 *
 * Then use the vars in child styles:
 *   background: radial-gradient(circle at var(--mouse-x) var(--mouse-y), …)
 */
export function useMousePositionVars(ref: React.RefObject<HTMLElement>) {
  const ticking = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      last.current.x = ((e.clientX - rect.left) / rect.width) * 100;
      last.current.y = ((e.clientY - rect.top) / rect.height) * 100;
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(() => {
          el!.style.setProperty("--mouse-x", `${last.current.x}%`);
          el!.style.setProperty("--mouse-y", `${last.current.y}%`);
          ticking.current = false;
        });
      }
    }

    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [ref]);
}
