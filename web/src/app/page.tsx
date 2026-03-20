"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import {
  Zap,
  Github,
  Upload,
  Terminal,
  ShieldAlert,
  ChevronRight,
  FolderArchive,
  ArrowUpRight,
  Activity,
  Lock,
  FileCode2,
  CircleDot,
} from "lucide-react";

/* ───── terminal simulation lines ───── */
const TERMINAL_LINES: { text: string; type: "cmd" | "ok" | "warn" | "err" | "info" }[] = [
  { text: "$ codemore scan ./src --deep", type: "cmd" },
  { text: "Indexing 247 files...", type: "info" },
  { text: "✓ Parsed TypeScript AST", type: "ok" },
  { text: "✓ Built dependency graph", type: "ok" },
  { text: "⚠ Possible SQL injection  src/db/query.ts:42", type: "warn" },
  { text: "✗ Hardcoded secret found  src/config.ts:7", type: "err" },
  { text: "⚠ Missing await on async  src/api/handler.ts:19", type: "warn" },
  { text: "✓ No XSS vectors in templates", type: "ok" },
  { text: "✗ Race condition detected  src/worker.ts:88", type: "err" },
  { text: "⚠ console.log in prod    src/utils/log.ts:3", type: "warn" },
  { text: "✓ Scan complete — 3 critical, 5 warnings", type: "ok" },
];

/* ───── marquee items ───── */
const DETECTIONS = [
  "SQL Injection",
  "XSS Vulnerabilities",
  "Memory Leaks",
  "Race Conditions",
  "Dead Code",
  "Hardcoded Secrets",
  "Missing Await",
  "Loose Equality",
  "Empty Catch Blocks",
  "console.log in Prod",
  "N+1 Queries",
  "Prototype Pollution",
  "Path Traversal",
  "Regex DoS",
  "Unvalidated Redirects",
  "Insecure Randomness",
];

/* ───── fake dashboard data ───── */
const FAKE_ISSUES = [
  { file: "src/db/query.ts", line: 42, severity: "critical", msg: "Unsanitized user input in SQL template literal", cat: "Security" },
  { file: "src/config.ts", line: 7, severity: "critical", msg: "AWS_SECRET_KEY exposed in source", cat: "Secrets" },
  { file: "src/worker.ts", line: 88, severity: "critical", msg: "Shared mutable state accessed across threads", cat: "Concurrency" },
  { file: "src/api/handler.ts", line: 19, severity: "warning", msg: "Async function called without await", cat: "Bugs" },
  { file: "src/utils/log.ts", line: 3, severity: "warning", msg: "console.log present in production bundle", cat: "Quality" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30",
  info: "bg-[#06b6d4]/20 text-[#06b6d4] border-[#06b6d4]/30",
};

/* ─────────────────────────────────────── */
/*           COMPONENT                     */
/* ─────────────────────────────────────── */

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  /* redirect logged-in users */
  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  /* ── terminal typewriter ── */
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleLines < TERMINAL_LINES.length) {
      const delay = TERMINAL_LINES[visibleLines]?.type === "cmd" ? 900 : 350 + Math.random() * 300;
      const timer = setTimeout(() => setVisibleLines((v) => v + 1), delay);
      return () => clearTimeout(timer);
    }
    // restart after a pause
    const restart = setTimeout(() => setVisibleLines(0), 3000);
    return () => clearTimeout(restart);
  }, [visibleLines]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [visibleLines]);

  /* ── drag and drop state ── */
  const [isDragging, setIsDragging] = useState(false);
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }

  if (session) return null; // will redirect

  const lineColor = (type: string) => {
    switch (type) {
      case "cmd": return "text-[#06b6d4]";
      case "ok": return "text-emerald-400";
      case "warn": return "text-[#f59e0b]";
      case "err": return "text-red-400";
      default: return "text-surface-400";
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 selection:bg-[#f59e0b]/30">
      <Navbar />

      {/* ══════════ HERO ══════════ */}
      <section className="relative overflow-hidden border-b border-surface-800">
        {/* noise-grain overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1fr,1fr] lg:gap-16 lg:py-28">
          {/* LEFT — statement */}
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-1 text-xs font-medium tracking-wide text-[#f59e0b]">
              <Activity size={12} /> NOT ANOTHER LINTER
            </div>

            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Your code has
              <br />
              <span className="bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#06b6d4] bg-clip-text text-transparent">
                secrets to tell.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-surface-400">
              CodeMore tears through your codebase in seconds. Security holes,
              race conditions, forgotten console.logs, that hardcoded AWS key
              from 2022 — we find it all and show you exactly where to look.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => signIn("google")}
                className="group flex items-center gap-2.5 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-surface-950 shadow-lg shadow-white/5 transition hover:shadow-white/10"
              >
                {/* Google SVG icon */}
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <button
                onClick={() => signIn("github")}
                className="group flex items-center gap-2.5 rounded-lg border border-surface-700 bg-surface-900 px-5 py-3 text-sm font-semibold text-white transition hover:border-surface-500 hover:bg-surface-800"
              >
                <Github size={18} />
                Continue with GitHub
              </button>
            </div>
          </div>

          {/* RIGHT — terminal simulation */}
          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-surface-700/60 bg-surface-900/80 shadow-2xl shadow-black/40">
              {/* title bar */}
              <div className="flex items-center gap-2 border-b border-surface-800 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-red-500/70" />
                <span className="h-3 w-3 rounded-full bg-[#f59e0b]/70" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <span className="ml-3 flex items-center gap-1.5 text-xs text-surface-500">
                  <Terminal size={12} /> codemore — scan
                </span>
              </div>
              {/* terminal body */}
              <div
                ref={termRef}
                className="h-72 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed"
              >
                {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
                  <div key={i} className={`${lineColor(line.type)} whitespace-pre`}>
                    {line.text}
                    {i === visibleLines - 1 && (
                      <span className="ml-0.5 inline-block h-4 w-[7px] animate-pulse bg-[#06b6d4]/70" />
                    )}
                  </div>
                ))}
                {visibleLines === 0 && (
                  <span className="inline-block h-4 w-[7px] animate-pulse bg-[#06b6d4]/70" />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ SCROLLING TICKER ══════════ */}
      <div className="relative overflow-hidden border-b border-surface-800 bg-surface-900/40 py-4">
        <div className="flex animate-[marquee_30s_linear_infinite] gap-8 whitespace-nowrap">
          {[...DETECTIONS, ...DETECTIONS].map((item, i) => (
            <span key={i} className="flex items-center gap-2 text-sm font-medium text-surface-400">
              <ShieldAlert size={14} className={i % 2 === 0 ? "text-[#f59e0b]" : "text-[#06b6d4]"} />
              {item}
              <span className="text-surface-600">{"//"}
              </span>
            </span>
          ))}
        </div>
        {/* fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-surface-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-surface-950 to-transparent" />
      </div>

      {/* ══════════ TWO WAYS TO START — SPLIT SECTION ══════════ */}
      <section className="relative grid min-h-[420px] md:grid-cols-2">
        {/* LEFT — Upload ZIP */}
        <div
          className={`relative flex flex-col items-center justify-center px-8 py-16 transition-colors ${
            isDragging ? "bg-[#f59e0b]/10" : "bg-surface-950"
          }`}
          onDragOver={(e) => { handleDrag(e); setIsDragging(true); }}
          onDragLeave={(e) => { handleDrag(e); setIsDragging(false); }}
          onDrop={(e) => { handleDrag(e); setIsDragging(false); }}
        >
          <div className="relative z-10 max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f59e0b]/30 bg-[#f59e0b]/10">
              <FolderArchive size={28} className="text-[#f59e0b]" />
            </div>
            <h3 className="text-2xl font-bold text-white">Drop your ZIP</h3>
            <p className="mt-2 text-sm text-surface-400">
              No sign-up required. Drag a .zip right here for an instant anonymous scan.
            </p>
            <button className="mt-6 inline-flex items-center gap-2 rounded-lg border border-dashed border-[#f59e0b]/40 px-5 py-2.5 text-sm font-medium text-[#f59e0b] transition hover:border-[#f59e0b] hover:bg-[#f59e0b]/10">
              <Upload size={16} />
              or click to browse
            </button>
          </div>
        </div>

        {/* diagonal divider (pure CSS) */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 hidden w-20 -translate-x-1/2 md:block">
          <svg viewBox="0 0 80 420" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
            <polygon points="0,0 80,0 80,420 0,420" fill="none" />
            <line x1="40" y1="0" x2="40" y2="420" stroke="currentColor" strokeWidth="1" className="text-surface-700" />
          </svg>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface-700 bg-surface-950 px-3 py-1 text-xs font-bold uppercase tracking-widest text-surface-500">
            or
          </div>
        </div>

        {/* RIGHT — GitHub */}
        <div className="relative flex flex-col items-center justify-center bg-surface-900/40 px-8 py-16">
          <div className="relative z-10 max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#06b6d4]/30 bg-[#06b6d4]/10">
              <Github size={28} className="text-[#06b6d4]" />
            </div>
            <h3 className="text-2xl font-bold text-white">Connect GitHub</h3>
            <p className="mt-2 text-sm text-surface-400">
              Sign in, pick a repo, and we pull the code directly. Re-scan anytime with one click.
            </p>
            <button
              onClick={() => signIn("github")}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#06b6d4] px-5 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-[#22d3ee]"
            >
              <Github size={16} />
              Connect Repository
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        {/* mobile divider */}
        <div className="absolute inset-x-0 top-1/2 flex items-center justify-center md:hidden">
          <div className="rounded-full border border-surface-700 bg-surface-950 px-3 py-1 text-xs font-bold uppercase tracking-widest text-surface-500">
            or
          </div>
        </div>
      </section>

      {/* ══════════ METRICS DASHBOARD PREVIEW ══════════ */}
      <section className="border-t border-surface-800 bg-surface-950">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <div className="mb-10 max-w-xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#06b6d4]">
              What you get
            </p>
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              A dashboard that actually helps.
            </h2>
            <p className="mt-3 text-surface-400">
              Not a wall of lint warnings. A clear, prioritized view of what matters — so you fix the right things first.
            </p>
          </div>

          {/* ── fake dashboard ── */}
          <div className="overflow-hidden rounded-xl border border-surface-700/60 bg-surface-900/60 shadow-2xl shadow-black/30">
            {/* top bar */}
            <div className="flex items-center justify-between border-b border-surface-800 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f59e0b]/20">
                  <Zap size={14} className="text-[#f59e0b]" />
                </div>
                <span className="text-sm font-semibold text-white">my-saas-app</span>
                <span className="rounded-md bg-surface-800 px-2 py-0.5 text-xs text-surface-400">247 files</span>
              </div>
              <span className="text-xs text-surface-500">Scanned 4s ago</span>
            </div>

            {/* stats row */}
            <div className="grid grid-cols-2 gap-px border-b border-surface-800 bg-surface-800 sm:grid-cols-4">
              {[
                { label: "Health Score", value: "68", accent: "text-[#f59e0b]", sub: "/ 100" },
                { label: "Critical", value: "3", accent: "text-red-400", sub: "issues" },
                { label: "Warnings", value: "12", accent: "text-[#f59e0b]", sub: "issues" },
                { label: "Clean Files", value: "89%", accent: "text-emerald-400", sub: "of total" },
              ].map((s) => (
                <div key={s.label} className="bg-surface-900/80 px-5 py-4">
                  <p className="text-xs text-surface-500">{s.label}</p>
                  <p className="mt-1">
                    <span className={`text-2xl font-bold ${s.accent}`}>{s.value}</span>
                    <span className="ml-1 text-xs text-surface-500">{s.sub}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* severity bar chart (pure CSS) */}
            <div className="flex items-end gap-1 border-b border-surface-800 px-5 py-4">
              <div className="flex flex-1 items-end gap-[3px]">
                {[38, 22, 65, 14, 48, 72, 30, 55, 10, 42, 60, 28, 45, 18, 52, 35, 68, 20, 40, 58].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all"
                    style={{
                      height: `${h}px`,
                      background: h > 55
                        ? "rgba(239,68,68,0.5)"
                        : h > 35
                        ? "rgba(245,158,11,0.4)"
                        : "rgba(6,182,212,0.3)",
                    }}
                  />
                ))}
              </div>
              <div className="ml-4 flex flex-col gap-1 text-[10px] text-surface-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500/50" />Critical</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#f59e0b]/40" />Warning</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#06b6d4]/30" />Info</span>
              </div>
            </div>

            {/* issue list */}
            <div className="divide-y divide-surface-800">
              {FAKE_ISSUES.map((issue, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3 transition hover:bg-surface-800/40">
                  <div className={`mt-0.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_COLORS[issue.severity]}`}>
                    {issue.severity}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{issue.msg}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-surface-500">
                      <FileCode2 size={11} />
                      {issue.file}:{issue.line}
                      <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px]">{issue.cat}</span>
                    </p>
                  </div>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-surface-600" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CTA ══════════ */}
      <section className="border-t border-surface-800">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center">
          <div className="mb-6 flex gap-1">
            {[...Array(3)].map((_, i) => (
              <CircleDot key={i} size={10} className={i === 0 ? "text-red-400" : i === 1 ? "text-[#f59e0b]" : "text-[#06b6d4]"} />
            ))}
          </div>
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Stop shipping blind.
          </h2>
          <p className="mt-3 max-w-md text-surface-400">
            You&apos;re one scan away from knowing what&apos;s lurking in your codebase.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-2 rounded-lg bg-[#f59e0b] px-6 py-3 text-sm font-bold text-surface-950 transition hover:bg-[#fbbf24]"
            >
              <Lock size={15} />
              Continue with Google
            </button>
            <button
              onClick={() => signIn("github")}
              className="flex items-center gap-2 rounded-lg border border-surface-600 px-6 py-3 text-sm font-semibold text-white transition hover:border-surface-400 hover:bg-surface-900"
            >
              <Github size={16} />
              Continue with GitHub
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-surface-800 py-6">
        <div className="flex items-center justify-center gap-2 text-xs text-surface-600">
          <Zap size={12} className="text-[#f59e0b]" />
          <span className="font-semibold text-surface-400">CodeMore</span>
          <span>&middot;</span>
          <span>Built for devs who read their warnings.</span>
        </div>
      </footer>

    </div>
  );
}
