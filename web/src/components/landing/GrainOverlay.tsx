/**
 * Film-grain overlay — fixed-position SVG noise.
 *
 * Adds tactile depth to the otherwise-flat dark surface so the landing
 * doesn't read as AI-generated flat-color soup. Renders an inline SVG
 * (no external request, no waterfall stall) with a turbulence filter
 * at 1.5% opacity, blended via mix-blend-mode: overlay so it darkens
 * darks and brightens lights without shifting hue.
 *
 * Pure decoration — `aria-hidden`, `pointer-events: none`.
 */
export function GrainOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-[0.018] mix-blend-overlay"
      style={{
        // Inline SVG via data URI so we avoid a network round-trip for a 12 KB asset.
        // baseFrequency tuned for visible-but-not-distracting grain at 1× DPR.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 220 220' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: "220px 220px",
      }}
    />
  );
}
