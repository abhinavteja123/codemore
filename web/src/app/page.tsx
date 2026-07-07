"use client";

/**
 * Landing — Part 8 revision.
 *
 * Changes vs Part 7:
 *  - Arc carousel cardIdx now binds to scroll progress within .scene2's
 *    350vh track (was click-only — cards stayed frozen as you scrolled past).
 *  - Centre card reveals a detail panel (severity, score, fix template, snippet).
 *  - Top-nav "Install" replaced with a NavInstallDropdown (5 surfaces inline).
 *  - Three new scroll-driven sections:
 *      Threat-class taxonomy (WebGL rings)
 *      3-surface byte-equality demo (typed report + hash)
 *      Agentic fix-loop replay (4-stage Detect → Plan → Patch → Validated)
 *  - Manifesto rewritten as a 3-act editorial — drop the awkward dropped "4".
 */

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  KeyRound,
  Terminal,
  Github,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Eye,
  Lock,
  Layers,
  Boxes,
  Code2,
} from "lucide-react";

import WebGLPortalBg          from "@/components/landing/designed/WebGLPortalBg";
import WebGLBrandLetter       from "@/components/landing/designed/WebGLBrandLetter";
import WebGLASTConnectionMesh from "@/components/landing/designed/WebGLASTConnectionMesh";
import SidebarHUDBars         from "@/components/landing/designed/SidebarHUDBars";
import PageTransitionIndicator from "@/components/landing/designed/PageTransitionIndicator";
import CodeMoreLinterSandbox  from "@/components/landing/designed/CodeMoreLinterSandbox";

import NavInstallDropdown     from "@/components/landing/NavInstallDropdown";
import WebGLThreatRings       from "@/components/landing/WebGLThreatRings";
import SurfaceParityDemo      from "@/components/landing/SurfaceParityDemo";
import AgenticFixLoopReplay   from "@/components/landing/AgenticFixLoopReplay";

/* ─── product data — wired to real v0.2.1 numbers ─────────────────── */

const HUD_SECTIONS = [
  { id: "passage",           label: "Overview Portal"   },
  { id: "scan",              label: "Findings Feed"     },
  { id: "threats",           label: "Threat Taxonomy"   },
  { id: "playground-linter", label: "Interactive Linter" },
  { id: "parity",            label: "Surface Parity"    },
  { id: "fix-loop",          label: "Agentic Fix Loop"  },
  { id: "docs",              label: "Manifesto Core"    },
  { id: "dashboard",         label: "Safety Figures"    },
] as const;

interface CardItem {
  id: number;
  idx: string;
  name: string;
  desc: string;
  tag: string;
  h1: number; h2: number; h3: number;
  icon: React.ReactNode;
  severity: "BLOCKER" | "MAJOR";
  score: string;
  remediation: string;
  codeSnippet: string;
}

const THREATS = [
  { id: "injection",  label: "Injection",        count: 8, blurb: "SQL-concat, shell-injection, eval, command-injection. Two-pass detectors confirm user-input reach.", rules: ["core-security-sql-injection-concat", "core-security-shell-injection", "core-security-eval"], cite: "OWASP A03:2021 · caught SQL-concat in 4 / 10 audited apps" },
  { id: "auth",       label: "Broken Auth",       count: 6, blurb: "BOLA, missing session checks, inverted-auth. Routes that authenticate the user but query foreign objects.", rules: ["vibe-auth-bola", "vibe-auth-missing-session-check", "vibe-auth-inverted"], cite: "OWASP A07 · 24% of vibe apps have inverted auth (DEV audit)" },
  { id: "crypto",     label: "Weak Crypto",       count: 4, blurb: "MD5 / SHA-1 / DES near password fields. Cookie-flag misuse. TLS verification disabled in production paths.", rules: ["core-security-weak-hash", "vibe-cookie-missing-flags", "core-security-tls-disabled"], cite: "OWASP A02 · MD5/SHA1 in password code in 3 / 10 apps" },
  { id: "secrets",    label: "Secrets",           count: 7, blurb: "Provider-token shapes (OpenAI, AWS, Stripe). Scans even .gitignored files like .env*, *.pem, firebase-adminsdk*.json.", rules: ["core-security-hardcoded-secret-pattern", "vibe-public-env-leak", "vibe-mcp-config-secret"], cite: "GitGuardian SOSS 2026 · we caught 7 production keys in audit" },
  { id: "llm",        label: "LLM-output sinks",   count: 4, blurb: "Agent / completion responses concatenated into eval, exec, SQL templates, Function() — without schema validation.", rules: ["vibe-llm-output-to-sink", "vibe-prompt-injection-sink", "vibe-agent-tool-no-confirm"], cite: "OWASP LLM02:2025 · emerging class — agent-call sinks" },
  { id: "supabase",   label: "Supabase RLS",      count: 3, blurb: "RLS disabled, USING (true) permissive, anon-key reachable from client bundle. The #1 Lovable footgun.", rules: ["vibe-supabase-rls-disabled", "vibe-supabase-rls-permissive", "vibe-supabase-anon-key-bundled"], cite: "DEV audit · 70% of Lovable apps with RLS off" },
  { id: "supply",     label: "Supply chain",       count: 4, blurb: "Hallucinated package names, recently-published low-download deps, dangerous deserialization, CI/CD secret echoes.", rules: ["vibe-supply-chain-hallucinated-import", "vibe-supply-chain-recently-published", "vibe-cicd-secret-in-yaml", "core-security-insecure-deserialization"], cite: "Slopsquatting · 20% of AI code references hallucinated pkgs" },
] as const;

/* ─── page ────────────────────────────────────────────────────────── */

export default function Landing() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  // ── Curtain entrance ─────────────────────────────────────────────
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsLoaded(true), 2400);
    return () => clearTimeout(t);
  }, []);

  // ── Scroll-driven portal animations ──────────────────────────────
  const passageRef  = useRef<HTMLElement>(null);
  const portalRef   = useRef<HTMLDivElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const heroHintRef = useRef<HTMLDivElement>(null);
  const diveVeilRef = useRef<HTMLDivElement>(null);
  const navRef      = useRef<HTMLElement>(null);
  const scanRef     = useRef<HTMLElement>(null);
  const threatsRef  = useRef<HTMLElement>(null);

  useEffect(() => {
    const smooth = (e0: number, e1: number, v: number) => {
      const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId: number | null = null;
    let curP  = -1; // eased progress; -1 = not yet initialised
    let lastT = 0;

    const apply = (p: number) => {
      const zoom      = 1 + Math.pow(p, 2.4) * 24;       // 1 → 25× — disc swells into a dive
      const coreB     = 1 + p * 1.6;                     // core brightens as we dive
      const ringO     = 1 - smooth(0.72, 0.96, p);       // ring fades just before the dive ends
      const copyO     = 1 - smooth(0.18, 0.52, p);
      const copyShift = p * -160;
      const copyScale = 1 + p * 0.12;
      const hintO     = 1 - smooth(0.02, 0.12, p);
      const veilO     = smooth(0.8, 0.99, p);            // crossfade into scene2 palette at dive end

      portalRef.current!.style.setProperty("--pz",     zoom.toFixed(3));
      portalRef.current!.style.setProperty("--core-b", coreB.toFixed(3));
      portalRef.current!.style.setProperty("--ring-o", ringO.toFixed(3));
      heroCopyRef.current!.style.opacity   = copyO.toFixed(3);
      heroCopyRef.current!.style.transform = `translateY(${copyShift.toFixed(1)}px) scale(${copyScale.toFixed(3)})`;
      heroHintRef.current!.style.opacity   = hintO.toFixed(3);
      if (diveVeilRef.current) diveVeilRef.current.style.opacity = veilO.toFixed(3);
    };

    // Eased follower: raw scroll position is the target; the displayed value
    // chases it with a time-based lerp. A fast flick from bottom to top no
    // longer teleports the portal 25×→1× in one frame (the visible "shutter") —
    // it settles over ~120ms instead. Loop keeps running until it converges.
    const tick = (t: number) => {
      rafId = null;
      if (navRef.current) {
        navRef.current.classList.toggle("is-scrolled", window.scrollY > 50);
      }
      if (!passageRef.current || !portalRef.current || !heroCopyRef.current || !heroHintRef.current) return;
      const rect   = passageRef.current.getBoundingClientRect();
      const len    = Math.max(passageRef.current.offsetHeight - window.innerHeight, 1);
      const target = Math.min(Math.max(-rect.top / len, 0), 1);

      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;
      if (curP < 0 || reduced) {
        curP = target; // first frame / reduced motion: no easing
      } else {
        curP += (target - curP) * (1 - Math.exp(-dt * 18)); // frame-rate independent
        if (Math.abs(target - curP) < 0.0008) curP = target;
      }
      apply(curP);
      if (curP !== target) rafId = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      if (rafId === null) {
        lastT = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // ── Nav hide on scroll-down ──────────────────────────────────────
  const [isNavHidden, setIsNavHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const hide = y > 120 && y > lastY.current;
        // setState only on actual transition — saves dozens of renders on fast
        // scroll-up bursts which otherwise cascade into WebGL flicker.
        setIsNavHidden(prev => (prev === hide ? prev : hide));
        lastY.current = y;
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Arc carousel — REAL CodeMore rule findings ──────────────────
  const CARDS: CardItem[] = useMemo(() => [
    {
      id: 0, idx: "Critical / Security", name: "SQL Injection",
      desc: "String-concat user input into db.query.\ncore-security-sql-injection-concat",
      tag: "View Rule →",
      h1: 205, h2: 222, h3: 248,
      icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
      severity: "BLOCKER", score: "9.8 / 10",
      remediation: "Use parameterised queries — every driver supports ? / $1 / %s placeholders.",
      codeSnippet: `// ❌ flagged at line 42\nconst q = \`SELECT * FROM users WHERE id = '\${id}'\`;\ndb.query(q);`,
    },
    {
      id: 1, idx: "Critical / Secrets", name: "Hardcoded Provider Key",
      desc: "Real provider token shape (OpenAI / AWS / Stripe / Google).\ncore-security-hardcoded-secret-pattern",
      tag: "View Rule →",
      h1: 255, h2: 272, h3: 292,
      icon: <KeyRound className="w-5 h-5 text-amber-400" />,
      severity: "BLOCKER", score: "9.5 / 10",
      remediation: "Move to env vars or a Key Vault. Audit caught 7 real keys across 5 codebases.",
      codeSnippet: `// ❌ caught even when .gitignored\nconst KEY = "sk-proj-abcdefghij…";`,
    },
    {
      id: 2, idx: "Critical / Supabase", name: "RLS Permissive Policy",
      desc: 'CREATE POLICY ... USING (true).\nvibe-supabase-rls-permissive',
      tag: "View Rule →",
      h1: 145, h2: 165, h3: 188,
      icon: <Lock className="w-5 h-5 text-emerald-300" />,
      severity: "BLOCKER", score: "9.3 / 10",
      remediation: "Anyone-can-read-anything is the #1 Lovable bug. Add WHERE owner = auth.uid().",
      codeSnippet: `-- ❌ in EchoVault — 10 of these found\nCREATE POLICY "Users viewable"\n  ON users FOR SELECT USING (true);`,
    },
    {
      id: 3, idx: "Critical / LLM", name: "LLM Output → Sink",
      desc: "Agent response flows into eval / exec / SQL template.\nvibe-llm-output-to-sink",
      tag: "View Rule →",
      h1: 280, h2: 300, h3: 18,
      icon: <Eye className="w-5 h-5 text-purple-300" />,
      severity: "BLOCKER", score: "9.6 / 10",
      remediation: "Schema-validate every model response before consuming it. OWASP LLM02.",
      codeSnippet: `// ❌ taint propagates one level\nconst code = completion.choices[0].message.content;\neval(code);`,
    },
    {
      id: 4, idx: "High / Crypto", name: "Weak Hash",
      desc: "MD5 / SHA-1 in auth context.\ncore-security-weak-hash",
      tag: "View Rule →",
      h1: 35, h2: 50, h3: 75,
      icon: <Layers className="w-5 h-5 text-orange-300" />,
      severity: "MAJOR", score: "7.8 / 10",
      remediation: "bcrypt / argon2id / scrypt — per-row salt, configurable work factor.",
      codeSnippet: `// ❌ password near MD5 → BLOCKER\nconst hash = crypto\n  .createHash('md5')\n  .update(password)\n  .digest('hex');`,
    },
  ], []);

  const [cardIdx, setCardIdx] = useState(0);

  // ── PHASE 8A — Scroll-bind cardIdx to scene2 track progress ─────
  useEffect(() => {
    const el = scanRef.current;
    if (!el) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
        const progress = Math.min(Math.max(-rect.top / trackLen, 0), 1);
        const continuous = progress * (CARDS.length - 1);
        const nextIdx = Math.min(CARDS.length - 1, Math.round(continuous));
        setCardIdx(prev => (prev === nextIdx ? prev : nextIdx));
        el.style.setProperty("--scene2-prog", continuous.toFixed(3));
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [CARDS.length]);

  const goToCard = (newIdx: number) => {
    const el = scanRef.current;
    if (!el) return;
    const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
    const targetProgress = newIdx / Math.max(CARDS.length - 1, 1);
    const targetTop = el.offsetTop + targetProgress * trackLen;
    window.scrollTo({ top: targetTop, behavior: "smooth" });
  };

  // ── PHASE 8B2 — Threat taxonomy scroll-bound active idx ─────────
  const [threatIdx, setThreatIdx] = useState(0);
  useEffect(() => {
    const el = threatsRef.current;
    if (!el) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
        const progress = Math.min(Math.max(-rect.top / trackLen, 0), 1);
        const continuous = progress * (THREATS.length - 1);
        const next = Math.min(THREATS.length - 1, Math.round(continuous));
        setThreatIdx(prev => (prev === next ? prev : next));
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  const goToThreat = (newIdx: number) => {
    const el = threatsRef.current;
    if (!el) return;
    const trackLen = Math.max(el.offsetHeight - window.innerHeight, 1);
    const targetProgress = newIdx / Math.max(THREATS.length - 1, 1);
    window.scrollTo({ top: el.offsetTop + targetProgress * trackLen, behavior: "smooth" });
  };

  // ── Section reveal animations ────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add("in");
      }),
      { threshold: 0.18 }
    );
    document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [isLoaded]);

  const onSignIn = () => signIn("github", { callbackUrl: "/dashboard" });

  if (status === "authenticated") return null;

  const activeThreat = THREATS[threatIdx];

  return (
    <>
      <PageTransitionIndicator sections={HUD_SECTIONS.map(s => s.label)} />

      {/* ───── CURTAIN ENTRANCE ───── */}
      {!isLoaded && (
        <>
          <div className="curtain">
            <div className="curtain__panel curtain__panel--l">
              <span className="curtain__text-half curtain__text-half--l">CODE</span>
            </div>
            <div className="curtain__panel curtain__panel--r">
              <span className="curtain__text-half curtain__text-half--r">MORE</span>
            </div>
          </div>
          <div className="curtain__seal"><span>VERIFY · SCAN · TRUST</span></div>
        </>
      )}

      {/* ───── TOP NAV ───── */}
      <header ref={navRef} className={"nav " + (isNavHidden ? "is-hidden" : "")}>
        <Link href="/" aria-label="CodeMore home" className="brand">
          <div className="brand__mark" />
          <span className="brand__name">CODEMORE</span>
        </Link>
        <nav className="nav__links">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/rules">Rules</Link>
          <NavInstallDropdown onWebScanner={onSignIn} />
          <a href="https://github.com/codemore-dev/codemore" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <button onClick={onSignIn} className="nav__cta">Sign in</button>
      </header>

      {/* ───── PORTAL HERO ───── */}
      <section ref={passageRef} id="passage" className="portal-scene" aria-label="The scan portal">
        <div className="portal-sticky">
          <div className="starfield" />
          <div ref={portalRef} className="portal" id="portal" aria-hidden="true">
            <div className="portal__ring" />
            <div className="portal__edge" />
            <div className="portal__core">
              <WebGLPortalBg />
            </div>
          </div>
          <div className="hero-vignette" />

          <div ref={heroCopyRef} className="hero-copy">
            <span className="kicker">v0.2.1 · 58 rules · 8 adapters · MIT</span>
            <h1 className="hero-title">
              The static analyzer<br />
              <span className="glow">your AI agent reads.</span>
            </h1>
            <p className="hero-sub">
              CodeMore catches the bugs that ship in vibe-coded apps — SQL injection,
              leaked secrets, broken Supabase RLS, LLM-output-to-eval — and emits a JSON
              report your coding agent can act on. Same brain across CLI · MCP · VS Code · GitHub Action.
            </p>
          </div>

          <div ref={heroHintRef} className="hero-hint">
            <span>scroll to enter</span>
            <div className="bar" />
          </div>

          {/* Painted over everything at dive end so the sticky release into
              scene2 is a seamless crossfade instead of a hard cut. */}
          <div ref={diveVeilRef} className="dive-veil" aria-hidden />
        </div>
      </section>

      {/* ───── SCENE 2 — ARC CAROUSEL (scroll-bound, Phase 8A) ───── */}
      <section id="scan" ref={scanRef} className="scene2">
        <div className="scene2__sticky">
          <div className="scene2__grid" />
          <div className="scene2__beam" />
          <span className="hud-bracket hud-bracket-tl" />
          <span className="hud-bracket hud-bracket-tr" />
          <span className="hud-bracket hud-bracket-bl" />
          <span className="hud-bracket hud-bracket-br" />

          <div className="scene2__hud-overlay">
            <div className="scene2__hud-left">
              <SidebarHUDBars sections={[...HUD_SECTIONS]} />
            </div>
            <div className="scene2__hud-right">
              <SidebarHUDBars sections={[...HUD_SECTIONS]} />
            </div>
          </div>

          <header className="scene2__head">
            <div>
              <div className="eyebrow">findings feed · 58 rules · scroll to advance</div>
              <h2>Every finding is agent-actionable. Five sample classes from the 2026-07-07 audit.</h2>
            </div>
            <p>
              Across 7 codebases we caught a real OpenAI key in a production .env, MCP-config
              secrets, Supabase RLS holes, and real shell + SQL injection — 100% of planted
              vulnerabilities detected, ~90% TP on BLOCKER findings.
            </p>
          </header>

          <div className="arc">
            {CARDS.map((c, i) => {
              const delta = i - cardIdx;
              const abs = Math.abs(delta);
              const isCenter = delta === 0;
              const xOffset = delta * 240;
              const yOffset = abs * 18;
              const rotate = delta * 6;
              const opacity = abs > 2 ? 0 : 1 - abs * 0.22;
              return (
                <div
                  key={c.id}
                  className={"card" + (isCenter ? " is-center" : "")}
                  onClick={() => goToCard(i)}
                  style={{
                    transform: `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) rotate(${rotate}deg)`,
                    opacity,
                    zIndex: 100 - abs,
                    // @ts-expect-error: CSS custom properties
                    "--h1": c.h1, "--h2": c.h2, "--h3": c.h3,
                  }}
                >
                  <div className="card__inner">
                    <div className="world" />
                    <div className="card__scrim" />
                    <div className="card__body">
                      <div className="card__idx">{c.idx}</div>
                      <div className="card__name">{c.name}</div>
                      <div className="card__desc" style={{ whiteSpace: "pre-line" }}>{c.desc}</div>
                      <div className="card__go">
                        {c.icon}<span style={{ marginLeft: 6 }}>{c.tag}</span>
                      </div>
                    </div>
                    <div className="card__detail">
                      <div className="card__detail-row">
                        <span className={c.severity === "BLOCKER" ? "pip-blocker" : "pip-major"}>
                          {c.severity}
                        </span>
                        <span><b>cvss</b> {c.score}</span>
                      </div>
                      <div className="card__detail-fix">{c.remediation}</div>
                      <div className="card__detail-snippet">{c.codeSnippet}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="arc-ui">
            <div className="arc-prog">
              <i style={{ transform: `translateX(${cardIdx * 100}%)`, width: `${100 / CARDS.length}%` }} />
            </div>
            <div className="arc-count">
              <b>{String(cardIdx + 1).padStart(2, "0")}</b>
              <span> · {String(CARDS.length).padStart(2, "0")}</span>
            </div>
            <div className="arc-btns">
              <button onClick={() => goToCard(Math.max(0, cardIdx - 1))} disabled={cardIdx === 0} aria-label="Previous">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => goToCard(Math.min(CARDS.length - 1, cardIdx + 1))} disabled={cardIdx === CARDS.length - 1} aria-label="Next">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ───── PHASE 8B2 — THREAT TAXONOMY (WebGL rings) ───── */}
      <section id="threats" ref={threatsRef} className="threats">
        <div className="threats__sticky">
          <WebGLThreatRings active={threatIdx} />

          <header className="threats__head reveal">
            <div className="eyebrow">threat taxonomy · 58 rules · 7 classes · scroll</div>
            <h2>Every rule maps to a known threat class.</h2>
          </header>

          <div className="threats__grid">
            <div className="threats__list">
              {THREATS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  className={"threats__row " + (i === threatIdx ? "is-active" : "")}
                  onClick={() => goToThreat(i)}
                >
                  <span className="threats__row-idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="threats__row-name">{t.label}</span>
                  <span className="threats__row-count">{t.count} rules</span>
                </button>
              ))}
            </div>

            <div className="threats__detail" key={activeThreat.id}>
              <div className="threats__detail-eyebrow">
                Class {String(threatIdx + 1).padStart(2, "0")} · {activeThreat.count} rules
              </div>
              <div className="threats__detail-title">{activeThreat.label}</div>
              <p className="threats__detail-blurb">{activeThreat.blurb}</p>
              <div className="threats__detail-rules">
                {activeThreat.rules.map(r => (
                  <span key={r} className="threats__detail-rule">{r}</span>
                ))}
              </div>
              <div className="threats__detail-cite">{activeThreat.cite}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── INTERACTIVE LINTER SANDBOX ───── */}
      <section id="playground-linter" className="relative bg-[var(--ink)] py-20">
        <div className="max-w-6xl mx-auto px-8">
          <div className="reveal mb-12">
            <div className="font-mono text-[11px] uppercase tracking-[0.38em] text-[var(--gold-soft)] mb-3">interactive linter</div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight max-w-3xl">
              Drop a vulnerable snippet — watch the agentic fix loop close.
            </h2>
          </div>
          <div className="reveal reveal-delay-1">
            <CodeMoreLinterSandbox />
          </div>
        </div>
      </section>

      {/* ───── PHASE 8B3 — 3-SURFACE BYTE-EQUALITY DEMO ───── */}
      <SurfaceParityDemo />

      {/* ───── PHASE 8B4 — AGENTIC FIX-LOOP REPLAY ───── */}
      <AgenticFixLoopReplay />

      {/* ───── PHASE 8C — MANIFESTO 3-ACT REWRITE ───── */}
      <section id="docs" className="manifesto">
        <div className="manifesto__inner">
          <div className="meta reveal">
            <div className="rule" />
            CODEMORE / MANIFESTO<br />
            v0.2.1 · 2026-07-07<br />
            MIT-LICENSED · OPT-IN TELEMETRY
          </div>

          <div className="manifesto__acts">
            <div className="reveal">
              <div className="manifesto__act-label">Act I — the bugs the agent wrote</div>
              <h3>
                <em>91.5%</em> of vibe-coded apps ship with at least one vulnerability.
              </h3>
              <p>
                The agent that wrote your last feature also wrote a SQL-concat, a permissive
                Supabase RLS policy, and an OpenAI key in <code>.env.local</code> that{" "}
                <code>.gitignore</code> made invisible to your SAST. <strong>The bugs aren&apos;t subtle.</strong>{" "}
                They are the same ones Veracode flagged on <em>45%</em> of AI-generated code,
                and the same ones Symbiotic counted on <em>98%</em> of 1,072 scanned vibe-coded sites.
              </p>
            </div>

            <div className="reveal reveal-delay-1">
              <div className="manifesto__act-label">Act II — the inversion</div>
              <h3 className="manifesto__punchline">
                Existing scanners report to <em>dashboards</em>.<br />
                CodeMore reports to your <em>agent</em>.
              </h3>
              <p>
                The agent that wrote the code can also <strong>fix</strong> the code — if it
                can <strong>read</strong> the report. CodeMore is the structured-feedback bus
                between the scanner and the coding agent: one schema, one fingerprint, the
                same bytes from the CLI, the MCP server, the VS Code extension, and the
                GitHub Action.
              </p>
            </div>

            <div className="reveal reveal-delay-2">
              <div className="manifesto__act-label">Act III — the 2026-07-07 audit</div>
              <h3>
                Across <em>7</em> codebases — <em>100%</em> of planted vulnerabilities detected,
                and a real key caught in the wild.
              </h3>
              <p>
                We surfaced a real OpenAI key sitting in a production <code>.env</code>, RLS
                holes, MCP-config secrets, and shell + SQL injection — then turned the scanner
                on itself and cut false-positive noise by 85% in the same day (three FP classes
                fixed, corpus still 100/100). <Link href="/docs/limitations">Read what we
                deliberately don&apos;t catch</Link> — context-dependent classes (weak password
                policy, audit-log completeness, business logic) live elsewhere.
              </p>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 mt-8 font-mono text-xs uppercase tracking-[0.22em] text-[#156252] hover:text-[#0d4a3f]"
              >
                Read the docs <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───── ATLAS / SAFETY FIGURES ───── */}
      <section id="dashboard" className="atlas">
        <div className="atlas__inner">
          <h4 className="reveal">Safety figures — the production audit.</h4>
          <div className="atlas-grid">
            <div className="atlas-cell reveal reveal-delay-1">
              <div className="k">Catalog</div>
              <div className="n">58</div>
              <div className="l">native rules across 6 packs, 100% recall / 100% precision on the 116-fixture corpus.</div>
            </div>
            <div className="atlas-cell reveal reveal-delay-2">
              <div className="k">Adapters</div>
              <div className="n">8</div>
              <div className="l">Ruff · Biome · golangci-lint · clippy · bandit · gitleaks · npm-audit · pip-audit.</div>
            </div>
            <div className="atlas-cell reveal reveal-delay-3">
              <div className="k">TP rate</div>
              <div className="n">~90%</div>
              <div className="l">on BLOCKER findings, 2026-07-07 audit across 7 codebases — 156 tests, CI green.</div>
            </div>
            <div className="atlas-cell reveal reveal-delay-4">
              <div className="k">Surfaces</div>
              <div className="n">4</div>
              <div className="l">CLI · MCP · VS Code · GitHub Action — byte-identical reports.</div>
            </div>
          </div>

          <div className="mt-16 reveal">
            <div className="rounded-2xl border border-white/[0.06] bg-[#06091a]/85 backdrop-blur-md p-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--gold-soft)] mb-3">install · 30 seconds</div>
              <div className="font-mono text-base text-white">
                <span className="text-[var(--gold-soft)]">$</span>{" "}
                npx codemore@latest scan .
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/docs/install#cli" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--gold)] text-[var(--ink)] font-medium text-sm hover:bg-[var(--gold-soft)] transition">
                  <Terminal className="w-4 h-4" /> CLI
                </Link>
                <Link href="/docs/install#mcp" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white font-medium text-sm hover:border-[var(--gold)] hover:text-[var(--gold-soft)] transition">
                  <Boxes className="w-4 h-4" /> MCP
                </Link>
                <Link href="/docs/install#vscode" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white font-medium text-sm hover:border-[var(--gold)] hover:text-[var(--gold-soft)] transition">
                  <Code2 className="w-4 h-4" /> VS Code
                </Link>
                <button onClick={onSignIn} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white font-medium text-sm hover:border-[var(--gold)] hover:text-[var(--gold-soft)] transition">
                  <Github className="w-4 h-4" /> Web Scanner
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="footer">
        <div className="footer__stars" />
        <div className="footer__inner">
          <div className="footer__top">
            <h5>The static analyzer your AI agent reads.</h5>
            <div className="fcol">
              <b>Product</b>
              <Link href="/docs/install">Install</Link>
              <Link href="/docs/rules">Rules</Link>
              <Link href="/docs/schema">Schema</Link>
              <Link href="/docs/external-tools">Adapters</Link>
            </div>
            <div className="fcol">
              <b>Docs</b>
              <Link href="/docs">Overview</Link>
              <Link href="/docs/security-gate">CI gate</Link>
              <Link href="/docs/limitations">Limitations</Link>
              <Link href="/docs/contributing">Contributing</Link>
            </div>
            <div className="fcol">
              <b>Community</b>
              <a href="https://github.com/codemore-dev/codemore" target="_blank" rel="noreferrer">GitHub</a>
              <Link href="/docs/github-action">GitHub Action</Link>
              <button onClick={onSignIn} className="text-left">Web scanner</button>
            </div>
          </div>

          <div className="footer__brand">
            {["C","O","D","E","M","O","R","E"].map((ch, i) => (
              <WebGLBrandLetter key={i} letter={ch} index={i} />
            ))}
          </div>

          <div className="footer__legal">
            <span>© 2026 CodeMore · MIT-licensed</span>
            <span>v0.2.1 · 58 rules · 8 adapters · ~90% TP</span>
            <span>opt-in telemetry · runs entirely in your repo</span>
          </div>
        </div>
      </footer>

      {/* Hidden AST connection mesh for ambient WebGL background depth — only mount when loaded */}
      {isLoaded && (
        <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.08 }}>
          <WebGLASTConnectionMesh />
        </div>
      )}
    </>
  );
}
