import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc8fc",
          400: "#36aaf8",
          500: "#0c8ee9",
          600: "#0070c7",
          700: "#0059a1",
          800: "#054c85",
          900: "#0a406e",
          950: "#072849",
        },
        surface: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
        // Acid lime — second accent for the "live" indicator + one CTA flair.
        // Adds harmony with the brand cyan without competing for the eye.
        acid: {
          400: "#bef264",
          500: "#a3e635",
          600: "#84cc16",
        },
      },
      fontFamily: {
        sans:    ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Inter Display Variable"', '"Inter Variable"', "Inter", "ui-sans-serif", "sans-serif"],
        mono:    ['"JetBrains Mono Variable"', '"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        // The inset-top-light hairline that sells glass-card depth.
        "glow-top":      "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        // Brand-toned outer halo for primary CTAs + active states.
        "glow-brand":    "0 0 0 1px rgba(12, 142, 233, 0.4), 0 8px 32px -8px rgba(12, 142, 233, 0.45)",
        "glow-brand-sm": "0 0 0 1px rgba(12, 142, 233, 0.3), 0 4px 16px -4px rgba(12, 142, 233, 0.35)",
        // Acid-toned for the second-accent CTA.
        "glow-acid":     "0 0 0 1px rgba(163, 230, 53, 0.35), 0 8px 32px -8px rgba(163, 230, 53, 0.35)",
      },
      backgroundImage: {
        // Hero radial — used by the static fallback when prefers-reduced-motion is on.
        "hero-mesh":
          "radial-gradient(60% 50% at 75% 25%, rgba(12,142,233,0.18), transparent 70%)," +
          "radial-gradient(40% 40% at 20% 90%, rgba(99,102,241,0.14), transparent 70%)",
      },
      animation: {
        // Use these via the .animate-* classnames when you don't need framer-motion's
        // full state machine. Keyframes live below.
        "live-pulse":  "live-pulse 2s ease-in-out infinite",
        "shimmer-x":   "shimmer-x 8s linear infinite",
        "aurora-1":    "aurora-1 32s ease-in-out infinite",
        "aurora-2":    "aurora-2 38s ease-in-out infinite",
        "aurora-3":    "aurora-3 44s ease-in-out infinite",
        "aurora-4":    "aurora-4 36s ease-in-out infinite",
      },
      keyframes: {
        "live-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%":      { opacity: "0.6", transform: "scale(0.9)" },
        },
        "shimmer-x": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Four aurora blob trajectories — each drifts on its own loop so the
        // composite never repeats visibly within a session.
        "aurora-1": {
          "0%, 100%": { transform: "translate3d(0%, 0%, 0) scale(1)" },
          "50%":      { transform: "translate3d(20%, -10%, 0) scale(1.15)" },
        },
        "aurora-2": {
          "0%, 100%": { transform: "translate3d(0%, 0%, 0) scale(1.05)" },
          "50%":      { transform: "translate3d(-15%, 12%, 0) scale(0.95)" },
        },
        "aurora-3": {
          "0%, 100%": { transform: "translate3d(0%, 0%, 0) scale(0.9)" },
          "50%":      { transform: "translate3d(12%, 15%, 0) scale(1.1)" },
        },
        "aurora-4": {
          "0%, 100%": { transform: "translate3d(0%, 0%, 0) scale(1)" },
          "50%":      { transform: "translate3d(-18%, -14%, 0) scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
