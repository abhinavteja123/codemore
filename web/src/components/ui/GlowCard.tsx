import type { ReactNode } from "react";

/**
 * GlassMorphism card with a per-card radial glow tied to a brand-aware color
 * key. Used across the landing's bento layouts to give each card visual
 * identity without painting every card the same.
 *
 * Replaces the flat `bg-surface-900/40 rounded-xl border` everywhere in the
 * Part 5 redesign. The inset-top-light hairline (`shadow-glow-top`) is the
 * touch that sells the depth — it's how Linear / Vercel cards feel layered.
 */

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

interface Props {
  glow?: Glow;
  className?: string;
  children: ReactNode;
}

export function GlowCard({ glow = "brand", className = "", children }: Props) {
  const rgb = GLOW_RGB[glow];
  return (
    <div
      className={
        "relative overflow-hidden rounded-[16px] border border-white/[0.06] " +
        "bg-surface-900/40 backdrop-blur-[2px] " +
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)] " +
        className
      }
      style={{
        backgroundImage:
          `radial-gradient(120% 80% at 100% 0%, rgba(${rgb}, 0.12), transparent 60%),` +
          `radial-gradient(80% 60% at 0% 100%, rgba(${rgb}, 0.05), transparent 70%)`,
      }}
    >
      {children}
    </div>
  );
}
