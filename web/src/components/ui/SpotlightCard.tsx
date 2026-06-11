"use client";

import React, { useRef, useEffect, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Glow = "brand" | "teal" | "fuchsia" | "amber" | "green" | "red" | "indigo" | "acid";

const GLOW_RGB: Record<Glow, string> = {
  brand:   "12, 142, 233",  // brand-500
  teal:    "20, 184, 166",  // teal-500
  fuchsia: "217, 70, 239",  // fuchsia-500
  amber:   "245, 158, 11",  // amber-500
  green:   "34, 197, 94",   // green-500
  red:     "239, 68, 68",   // red-500
  indigo:  "99, 102, 241",  // indigo-500
  acid:    "163, 230, 53",  // acid-500
};

interface SpotlightCardProps {
  glow?: Glow;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  as?: "div" | "article" | "section";
}

export function SpotlightCard({
  glow = "brand",
  className = "",
  innerClassName = "",
  children,
  as: Tag = "div",
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const rgb = GLOW_RGB[glow];

  useEffect(() => {
    const el = containerRef.current;
    if (!el || reduced) return;

    let ticking = false;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          el.style.setProperty("--mouse-x", `${x}px`);
          el.style.setProperty("--mouse-y", `${y}px`);
          ticking = false;
        });
      }
    };

    el.addEventListener("mousemove", handleMouseMove);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
    };
  }, [reduced]);

  return (
    <Tag
      ref={containerRef}
      className={
        `group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-300 ` +
        `bg-white/[0.04] hover:bg-white/[0.08] ` +
        `shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)] ${className}`
      }
    >
      {/* Border Spotlight Glow */}
      {!reduced && (
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(150px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), rgba(${rgb}, 0.45), transparent 70%)`,
          }}
        />
      )}

      {/* Internal Content Pane */}
      <div
        className={
          `relative z-10 rounded-[15px] h-full w-full overflow-hidden ` +
          `bg-surface-950/90 backdrop-blur-[2px] transition-colors duration-300 ` +
          `group-hover:bg-surface-950/80 ${innerClassName}`
        }
        style={{
          backgroundImage:
            `radial-gradient(120% 80% at 100% 0%, rgba(${rgb}, 0.08), transparent 60%),` +
            `radial-gradient(80% 60% at 0% 100%, rgba(${rgb}, 0.03), transparent 70%)`,
        }}
      >
        {/* Background Spotlight Glow */}
        {!reduced && (
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: `radial-gradient(220px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), rgba(${rgb}, 0.06), transparent 80%)`,
            }}
          />
        )}

        <div className="relative z-10 h-full w-full">{children}</div>
      </div>
    </Tag>
  );
}
