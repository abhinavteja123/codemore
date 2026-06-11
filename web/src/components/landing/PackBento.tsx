"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

/**
 * PackBento — asymmetric 4-column catalog bento.
 *
 * core-quality (largest pack) is 2×1.
 * Other packs are 1×1.
 * Each tile has a distinct glow color tied to its security semantic.
 *
 * Hover lifts + reveals 3 representative rule ids — keeps the card silent
 * by default so the visitor isn't drinking from a firehose.
 */

type Glow = Parameters<typeof SpotlightCard>[0]["glow"];

interface Pack {
  name: string;
  count: number;
  blurb: string;
  rules: string[];
  glow: Glow;
  span?: 1 | 2;
}

const PACKS: Pack[] = [
  {
    name: "core-quality",
    count: 22,
    blurb: "Pivot debris. Unused exports, cyclomatic complexity, dead conditionals, the leftover prints.",
    rules: ["core-quality-cyclomatic-complexity", "core-quality-unused-export", "core-quality-dead-conditional"],
    glow: "brand",
    span: 2,
  },
  {
    name: "core-security",
    count: 19,
    blurb: "SQLi · path traversal · weak crypto · insecure deserialization · TLS-off · the eval family.",
    rules: ["core-security-sql-injection-concat", "core-security-path-traversal", "core-security-weak-hash"],
    glow: "red",
  },
  {
    name: "vibe-auth",
    count: 3,
    blurb: "BOLA · missing session checks · inverted auth.",
    rules: ["vibe-auth-bola", "vibe-auth-missing-session-check", "vibe-auth-inverted"],
    glow: "amber",
  },
  {
    name: "vibe-frontend",
    count: 5,
    blurb: "XSS · CORS-with-creds · missing rate limit · cookie flags · file-upload validation.",
    rules: ["vibe-cookie-missing-flags", "vibe-no-rate-limit", "vibe-file-upload-no-validation"],
    glow: "teal",
  },
  {
    name: "vibe-secrets",
    count: 4,
    blurb: "Public env leaks · hardcoded JWTs · MCP config secrets · CI/CD YAML.",
    rules: ["vibe-cicd-secret-in-yaml", "vibe-public-env-leak", "vibe-mcp-config-secret"],
    glow: "fuchsia",
  },
  {
    name: "vibe-supabase",
    count: 3,
    blurb: "RLS off · RLS permissive · anon key bundled to client.",
    rules: ["vibe-supabase-rls-disabled", "vibe-supabase-rls-permissive", "vibe-supabase-anon-key-bundled"],
    glow: "green",
  },
  {
    name: "vibe-llm",
    count: 2,
    blurb: "LLM output → eval sink · agent tool without confirm.",
    rules: ["vibe-llm-output-to-sink", "vibe-agent-tool-no-confirm"],
    glow: "indigo",
  },
];

export function PackBento() {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ staggerChildren: 0.06 }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {PACKS.map(p => (
        <motion.div
          key={p.name}
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={p.span === 2 ? "sm:col-span-2" : ""}
        >
          <Link href="/docs/rules" className="group block h-full">
            <SpotlightCard
              glow={p.glow}
              innerClassName="p-6"
              className="relative h-full overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <code className="font-mono text-[13px] tracking-[-0.01em] text-surface-100">{p.name}</code>
                <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] text-surface-300">
                  {p.count} {p.count === 1 ? "rule" : "rules"}
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-surface-300">{p.blurb}</p>

              {/* Hover-revealed representative rule ids */}
              <ul className="mt-4 max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-300 ease-out group-hover:max-h-32 group-hover:opacity-100">
                {p.rules.map(r => (
                  <li key={r} className="font-mono text-[11px] text-surface-400 [&+li]:mt-0.5">
                    <span className="text-surface-600">›</span> {r}
                  </li>
                ))}
              </ul>

              <div className="mt-5 inline-flex items-center gap-1 font-mono text-[11px] text-surface-500 group-hover:text-brand-400">
                browse pack
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
            </SpotlightCard>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
