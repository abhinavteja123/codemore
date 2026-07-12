"use client";

import React from "react";
import Link from "next/link";
import NavInstallDropdown from "./NavInstallDropdown";

interface HeroOverlayProps {
  navRef: React.RefObject<HTMLElement | null>;
  heroCopyRef: React.RefObject<HTMLDivElement | null>;
  heroHintRef: React.RefObject<HTMLDivElement | null>;
  starfieldRef: React.RefObject<HTMLDivElement | null>;
  vignetteRef: React.RefObject<HTMLDivElement | null>;
  diveVeilRef: React.RefObject<HTMLDivElement | null>;
  version: string;
  onSignIn: () => void;
}

export default function HeroOverlay({
  navRef,
  heroCopyRef,
  heroHintRef,
  starfieldRef,
  vignetteRef,
  diveVeilRef,
  version,
  onSignIn,
}: HeroOverlayProps) {
  return (
    <>
      {/* ───── TOP NAV ───── */}
      <header ref={navRef} className="nav">
        <Link href="/" aria-label="CodeMore home" className="brand">
          <div className="brand__mark" />
          <span className="brand__name">CODEMORE</span>
        </Link>
        <nav className="nav__links">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/rules">Rules</Link>
          <NavInstallDropdown onWebScanner={onSignIn} />
          <a href="https://github.com/abhinavteja123/codemore" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <button onClick={onSignIn} className="nav__cta">
          Sign in
        </button>
      </header>

      {/* ───── STARFIELD BACKGROUND LAYER ───── */}
      <div ref={starfieldRef} className="starfield" />

      {/* ───── BLACK VIGNETTE OVERLAY ───── */}
      <div ref={vignetteRef} className="hero-vignette" />

      {/* ───── HERO TEXT COPY ───── */}
      <div ref={heroCopyRef} className="hero-copy">
        <span className="kicker">{`v${version} · 59 rules · 8 adapters · MIT`}</span>
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

      {/* ───── SCROLL HINT LABEL ───── */}
      <div ref={heroHintRef} className="hero-hint">
        <span>scroll to enter</span>
        <div className="bar" />
      </div>

      {/* ───── DIVE VEIL CROSSFADE LAYER ───── */}
      <div ref={diveVeilRef} className="dive-veil" aria-hidden />
    </>
  );
}
