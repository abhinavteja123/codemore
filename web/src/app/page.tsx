"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Github, Terminal, Boxes, Code2, ArrowRight, Sparkles } from "lucide-react";

import { AuroraBackground }    from "@/components/landing/AuroraBackground";
import { SpotlightHero }       from "@/components/landing/SpotlightHero";
import { HeroLogo }            from "@/components/landing/HeroLogo";
import { TerminalDemoPro }     from "@/components/landing/TerminalDemoPro";
import { BentoStats }          from "@/components/landing/BentoStats";
import { HowItWorks }          from "@/components/landing/HowItWorks";
import { CommandTabs }         from "@/components/landing/CommandTabs";
import { PackBento }           from "@/components/landing/PackBento";
import { LimitationsTerminal } from "@/components/landing/LimitationsTerminal";
import { MagneticButton }      from "@/components/landing/MagneticButton";
import { MarqueeLogos }        from "@/components/landing/MarqueeLogos";
import { InteractiveDiff }     from "@/components/landing/InteractiveDiff";

/* ─── nav ───────────────────────────────────────────────────────────── */

function TopNav({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-surface-950/65 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="CodeMore home" className="flex items-center gap-2.5">
          <HeroLogo size={28} />
          <span className="font-display text-[17px] font-bold tracking-tight text-surface-50">
            Code<span className="text-brand-400">More</span>
          </span>
        </Link>
        <nav className="hidden gap-7 font-mono text-[12px] text-surface-400 md:flex">
          <Link href="/docs"          className="hover:text-surface-100 transition-colors">docs</Link>
          <Link href="/docs/rules"    className="hover:text-surface-100 transition-colors">rules</Link>
          <Link href="/docs/install"  className="hover:text-surface-100 transition-colors">install</Link>
          <a href="https://github.com/codemore-dev/codemore" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-surface-100 transition-colors">
            <Github className="h-3.5 w-3.5" /> github
          </a>
        </nav>
        <button
          onClick={onSignIn}
          className="rounded-lg border border-white/[0.08] bg-surface-900/80 px-4 py-1.5 text-[12.5px] font-semibold tracking-tight text-surface-100 transition-all hover:border-brand-500/50 hover:bg-surface-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          Sign in
        </button>
      </div>
    </header>
  );
}

/* ─── page ──────────────────────────────────────────────────────────── */

export default function Landing() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);
  if (status === "authenticated") return null;

  const handleSignIn = () => signIn("github", { callbackUrl: "/dashboard" });

  return (
    <div className="min-h-screen bg-surface-950 text-surface-100">
      <TopNav onSignIn={handleSignIn} />

      {/* ───── HERO ───── */}
      <section className="relative overflow-hidden">
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />
        <AuroraBackground />
        <SpotlightHero>
          <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:py-28">
            <div id="main" className="flex flex-col items-start justify-center">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.45 }}
                className="inline-flex items-center gap-2 rounded-full border border-acid-500/30 bg-acid-500/10 px-3 py-1 font-mono text-[11px] tracking-[0.06em] text-acid-400"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-acid-500 animate-live-pulse" />
                v0.2.0 · 58 rules · 8 adapters
              </motion.div>

              <h1 className="mt-6 font-display text-[44px] font-bold leading-[1.04] tracking-[-0.035em] text-surface-50 sm:text-[56px] lg:text-[68px]">
                {["The", "static", "analyzer", "your"].map((w, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.15 + i * 0.04 }}
                    className="inline-block"
                  >
                    {w}&nbsp;
                  </motion.span>
                ))}
                <br />
                <motion.span
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.34 }}
                  className="inline-block"
                >
                  <span className="bg-gradient-to-r from-brand-400 via-brand-300 to-acid-400 bg-clip-text text-transparent">
                    AI agent
                  </span>{" "}
                  reads.
                </motion.span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}
                className="mt-6 max-w-xl text-[17px] leading-relaxed text-surface-300"
              >
                CodeMore catches the bugs that ship in vibe-coded apps — SQL injection, leaked secrets,
                broken Supabase RLS, LLM-output-to-eval — and emits a JSON report your coding agent
                can act on. Same brain across CLI · MCP · VS Code · GitHub Actions.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.75 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <MagneticButton href="/docs/install#cli" variant="primary">
                  <Terminal className="h-4 w-4" /> Install CLI
                </MagneticButton>
                <MagneticButton href="/docs/install#mcp" variant="ghost">
                  <Boxes className="h-4 w-4" /> Connect MCP
                </MagneticButton>
                <MagneticButton href="/docs/install#vscode" variant="ghost">
                  <Code2 className="h-4 w-4" /> Install VS Code
                </MagneticButton>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.95 }}
                className="mt-7 inline-flex items-center gap-2 font-mono text-[12px] text-surface-500"
              >
                <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                MIT-licensed · opt-in telemetry · runs entirely in your repo
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}
              className="self-center"
            >
              <TerminalDemoPro />
            </motion.div>
          </div>
        </SpotlightHero>
      </section>

      {/* ───── TECH MARQUEE ───── */}
      <MarqueeLogos />

      {/* ───── STATS ───── */}
      <section className="relative border-y border-white/[0.04] bg-surface-950/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-400">
                industry impact
              </div>
              <h2 className="font-display text-[32px] font-bold tracking-tight text-surface-50 sm:text-[40px]">
                The bugs are <span className="text-brand-400">measurable.</span>
              </h2>
            </div>
            <p className="max-w-md text-[14.5px] text-surface-300 leading-relaxed">
              AI-generated apps ship with predictable, measurable vulnerabilities. Existing scanners
              report them to dashboards — none speak fluently to the agent that wrote the code.
            </p>
          </div>
          <BentoStats />
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-14 max-w-2xl">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-400">
              The loop
            </div>
            <h2 className="font-display text-[32px] font-bold leading-tight tracking-tight text-surface-50 sm:text-[40px]">
              One brain. Three steps. One report contract.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-surface-300">
              Whether you invoke from the terminal, an MCP-aware IDE, or a PR comment bot — the same
              scanner emits the same schema and the same agentic fix loop closes the gap.
            </p>
          </div>
          <HowItWorks />
        </div>
      </section>

      {/* ───── INTERACTIVE DIFF SHOWCASE ───── */}
      <section className="relative border-t border-white/[0.04] bg-surface-950/20">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-14 max-w-2xl">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-400">
              agent workflow in action
            </div>
            <h2 className="font-display text-[32px] font-bold leading-tight tracking-tight text-surface-50 sm:text-[40px]">
              Vibe-coded vulnerabilities. Fixed in seconds.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-surface-300">
              See how CodeMore catches critical architectural flaws and provides structure-stable JSON feedback that AI coders use to auto-patch the codebase.
            </p>
          </div>
          <InteractiveDiff />
        </div>
      </section>

      {/* ───── SURFACES ───── */}
      <section className="relative border-y border-white/[0.04] bg-surface-950/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-400">
                Install
              </div>
              <h2 className="font-display text-[32px] font-bold tracking-tight text-surface-50 sm:text-[40px]">
                Pick your surface.
              </h2>
              <p className="mt-3 text-[15px] text-surface-300">
                The CLI is canonical — every other surface wraps it. Hit{" "}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px]">⌘1</kbd>
                {" "}–{" "}
                <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px]">⌘4</kbd>
                {" "}to jump between tabs.
              </p>
            </div>
          </div>
          <CommandTabs />
        </div>
      </section>

      {/* ───── CATALOG ───── */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-brand-400">
                Catalog
              </div>
              <h2 className="font-display text-[32px] font-bold tracking-tight text-surface-50 sm:text-[40px]">
                58 rules across 7 packs.
              </h2>
              <p className="mt-3 max-w-xl text-[15px] text-surface-300">
                Every rule has a TP / FP fixture pair in the corpus. 100% recall and 100% precision
                verified on every release. Lifecycle: experimental → beta → stable.
              </p>
            </div>
            <Link
              href="/docs/rules"
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-surface-900/60 px-3.5 py-2 font-mono text-[12px] text-surface-100 transition hover:border-brand-500/40 hover:bg-surface-800/60"
            >
              browse all rules
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <PackBento />
        </div>
      </section>

      {/* ───── HONESTY ───── */}
      <section className="relative border-y border-white/[0.04] bg-surface-950/40">
        <div className="mx-auto max-w-4xl px-6 py-24">
          <div className="mb-10 max-w-2xl">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-rose-400">
              Honesty
            </div>
            <h2 className="font-display text-[32px] font-bold tracking-tight text-surface-50 sm:text-[40px]">
              What CodeMore <span className="text-rose-400">doesn&apos;t</span> catch.
            </h2>
            <p className="mt-3 text-[15px] text-surface-300">
              We hold to a strict bar — every finding must be agent-actionable. The rest needs
              other tools, and we link to them.
            </p>
          </div>
          <LimitationsTerminal />
        </div>
      </section>

      {/* ───── CTA ───── */}
      <section className="relative">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <h2 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-surface-50 sm:text-[52px]">
            Start scanning in <span className="text-brand-400">30 seconds.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15.5px] text-surface-300">
            No account for the CLI. The web scanner takes a one-click GitHub sign-in.
          </p>
          <div className="mx-auto mt-9 inline-flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#06091a]/85 px-5 py-3 font-mono text-[13px] text-surface-50 shadow-glow-top">
            <span className="text-brand-400 select-none">$</span>
            npx codemore@latest scan .
          </div>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <MagneticButton href="/docs" variant="primary">
              Read the docs <ArrowRight className="h-4 w-4" />
            </MagneticButton>
            <MagneticButton onClick={handleSignIn} variant="ghost">
              <Github className="h-4 w-4" /> Sign in with GitHub
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="relative border-t border-white/[0.04] bg-surface-950">
        {/* Shimmer hairline */}
        <div
          aria-hidden
          className="h-px w-full animate-shimmer-x bg-[linear-gradient(90deg,transparent_0%,rgba(54,170,248,0.45)_30%,rgba(163,230,53,0.45)_60%,transparent_100%)] bg-[length:200%_100%]"
        />
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HeroLogo size={22} />
            <span className="font-mono text-[12px] text-surface-500">
              CodeMore · MIT-licensed · opt-in telemetry
            </span>
          </div>
          <nav className="flex gap-6 font-mono text-[12px] text-surface-400">
            <Link href="/docs"             className="hover:text-surface-100">docs</Link>
            <Link href="/docs/rules"       className="hover:text-surface-100">rules</Link>
            <Link href="/docs/limitations" className="hover:text-surface-100">limitations</Link>
            <a href="https://github.com/codemore-dev/codemore" target="_blank" rel="noreferrer" className="hover:text-surface-100">github</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
