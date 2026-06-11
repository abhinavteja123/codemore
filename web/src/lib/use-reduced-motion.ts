"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` when the user has requested reduced motion via OS settings
 * (prefers-reduced-motion: reduce). All persistent + entrance animations on
 * the landing/dashboard should bypass when this is true.
 *
 * Defaults to `false` on the server so the initial paint matches a non-reduced
 * client; the hook then updates after hydration if the user opted in.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return reduced;
}
