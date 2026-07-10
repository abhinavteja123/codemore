"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldAlert, Check, AlertTriangle } from "lucide-react";
import { SpotlightCard } from "../ui/SpotlightCard";

interface DiffCase {
  id: string;
  name: string;
  vulnTitle: string;
  vulnDesc: string;
  fixDesc: string;
  vulnFile: string;
  vulnCode: string;
  fixCode: string;
  vulnHighlightLine: number;
  fixHighlightLine: number;
}

const CASES: DiffCase[] = [
  {
    id: "sqli",
    name: "SQL Injection",
    vulnTitle: "User input concatenated directly into raw queries",
    vulnDesc: "Vibe-coded agents often build raw strings for speed, bypassing database query sanitization and exposing the database to full takeover.",
    fixDesc: "CodeMore scans the AST, flags the raw concatenation, and prompts the agent to replace it with parameterized values.",
    vulnFile: "src/api/users.ts",
    vulnCode: `// VULNERABLE: Direct string interpolation
async function getUser(id: string) {
  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;
  const result = await db.execute(query);
  return result.rows[0];
}`,
    fixCode: `// SECURE: Parameterized query statement
async function getUser(id: string) {
  const query = "SELECT * FROM users WHERE id = $1";
  const result = await db.execute(query, [id]);
  return result.rows[0];
}`,
    vulnHighlightLine: 3,
    fixHighlightLine: 3,
  },
  {
    id: "supabase",
    name: "Supabase RLS",
    vulnTitle: "Table created without row-level security enabled",
    vulnDesc: "Supabase tables default to open access. Failing to enable Row-Level Security (RLS) leaks customer data to anyone with an anonymous client key.",
    fixDesc: "CodeMore verifies migration or schema files, detects tables without RLS, and emits the exact SQL statement required to secure them.",
    vulnFile: "supabase/migrations/create_posts.sql",
    vulnCode: `-- VULNERABLE: Table public by default
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  user_id uuid references auth.users
);
-- Missing RLS enabling command`,
    fixCode: `-- SECURE: RLS enabled + Owner policies
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text,
  user_id uuid references auth.users
);

alter table public.posts enable row level security;

create policy "Users can modify own posts" 
  on public.posts for all 
  using (auth.uid() = user_id);`,
    vulnHighlightLine: 7,
    fixHighlightLine: 7,
  },
  {
    id: "secrets",
    name: "Secrets Leak",
    vulnTitle: "Hardcoded API keys and credentials in source files",
    vulnDesc: "LLMs commonly output authentic placeholders or live test tokens. Committing these results in automated crawler compromise within minutes.",
    fixDesc: "CodeMore's secret scanner analyzes string patterns, catches credentials before commit, and guides the agent to use safe process envs.",
    vulnFile: "src/lib/client.ts",
    vulnCode: `// VULNERABLE: Exposed private key
const stripe = new Stripe(
  "sk_live_51Nz8j2B9sK7Yw9xP82J0xLm3Q5..."
);`,
    fixCode: `// SECURE: Environment variable configuration
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY as string
);`,
    vulnHighlightLine: 2,
    fixHighlightLine: 2,
  },
];

export function InteractiveDiff() {
  const [activeTab, setActiveTab] = useState(CASES[0].id);
  const current = CASES.find((c) => c.id === activeTab)!;

  return (
    <div className="w-full space-y-6">
      {/* Tabs list */}
      <div className="flex flex-wrap justify-center gap-2">
        {CASES.map((c) => {
          const isActive = c.id === activeTab;
          return (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`relative px-4 py-2 font-mono text-xs rounded-lg transition-colors border ${
                isActive
                  ? "border-brand-500/30 bg-brand-500/10 text-white"
                  : "border-white/[0.04] bg-surface-900/30 text-surface-400 hover:text-surface-100 hover:border-white/[0.08]"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="diff-tab-highlight"
                  className="absolute inset-0 rounded-lg bg-brand-500/[0.03] ring-1 ring-brand-500/20"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Main Diff Panel */}
      <SpotlightCard glow="brand" className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
          
          {/* Explanations Sidebar (4 cols) */}
          <div className="lg:col-span-4 p-6 sm:p-8 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-400 font-semibold block">
                vulnerability profile
              </span>
              <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-surface-50 leading-tight">
                {current.vulnTitle}
              </h3>
              
              <div className="space-y-4 pt-2">
                <div className="flex gap-3 items-start">
                  <div className="p-1 rounded bg-rose-500/10 text-rose-400 shrink-0 mt-0.5">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-rose-300 tracking-wide uppercase">Vibe-coded issue</h4>
                    <p className="text-xs text-surface-300 mt-1 leading-relaxed">{current.vulnDesc}</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-emerald-300 tracking-wide uppercase">CodeMore Fix</h4>
                    <p className="text-xs text-surface-300 mt-1 leading-relaxed">{current.fixDesc}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between">
              <span className="font-mono text-[11px] text-surface-500">
                target: {current.vulnFile.split("/").pop()}
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <Check className="h-3 w-3" /> Auto-patch ready
              </span>
            </div>
          </div>

          {/* Code Showcase (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
            
            {/* Vulnerable Side */}
            <div className="flex flex-col bg-red-950/[0.03]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-black/10">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  <span className="font-mono text-[11px] font-semibold text-rose-300 tracking-wide uppercase">vulnerable code</span>
                </div>
                <span className="font-mono text-[10px] text-surface-500">{current.vulnFile}</span>
              </div>
              <div className="p-4 font-mono text-xs overflow-x-auto leading-[1.8] text-surface-200 flex-1 min-h-[200px]">
                {current.vulnCode.split("\n").map((line, idx) => {
                  const lineNum = idx + 1;
                  const isHighlighted = lineNum === current.vulnHighlightLine;
                  return (
                    <div
                      key={idx}
                      className={`flex ${isHighlighted ? "bg-rose-500/10 border-l-2 border-rose-500 -ml-4 pl-[14px] text-rose-200" : ""}`}
                    >
                      <span className="w-6 text-surface-600 text-[10px] select-none text-right mr-3.5">
                        {lineNum}
                      </span>
                      <span>{line || " "}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Secure Side */}
            <div className="flex flex-col bg-emerald-950/[0.02]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] bg-black/10">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-mono text-[11px] font-semibold text-emerald-300 tracking-wide uppercase">agent fix</span>
                </div>
                <span className="font-mono text-[10px] text-surface-500">{current.vulnFile}</span>
              </div>
              <div className="p-4 font-mono text-xs overflow-x-auto leading-[1.8] text-surface-200 flex-1 min-h-[200px]">
                {current.fixCode.split("\n").map((line, idx) => {
                  const lineNum = idx + 1;
                  const isHighlighted = lineNum >= current.fixHighlightLine && lineNum <= current.fixHighlightLine + 3;
                  return (
                    <div
                      key={idx}
                      className={`flex ${isHighlighted ? "bg-emerald-500/10 border-l-2 border-emerald-500 -ml-4 pl-[14px] text-emerald-200" : ""}`}
                    >
                      <span className="w-6 text-surface-600 text-[10px] select-none text-right mr-3.5">
                        {lineNum}
                      </span>
                      <span>{line || " "}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>
      </SpotlightCard>
    </div>
  );
}
