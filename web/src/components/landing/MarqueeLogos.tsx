"use client";

import React from "react";
import { Github, Code2, Layers, Terminal, Sparkles, Database, ShieldAlert, Cpu } from "lucide-react";

interface TechItem {
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const ITEMS: TechItem[] = [
  { name: "TypeScript", Icon: Code2, color: "text-[#3178c6]" },
  { name: "Python", Icon: Layers, color: "text-[#3776ab]" },
  { name: "Go Lang", Icon: Cpu, color: "text-[#00add8]" },
  { name: "Rust / Clippy", Icon: Terminal, color: "text-[#dea584]" },
  { name: "Supabase RLS", Icon: Database, color: "text-[#3ecf8e]" },
  { name: "Ruff Linter", Icon: Sparkles, color: "text-[#fcd34d]" },
  { name: "Biome Compiler", Icon: Layers, color: "text-[#f472b6]" },
  { name: "OWASP Rules", Icon: ShieldAlert, color: "text-[#f43f5e]" },
  { name: "GitHub Actions", Icon: Github, color: "text-[#e2e8f0]" },
];

export function MarqueeLogos() {
  const doubledItems = [...ITEMS, ...ITEMS, ...ITEMS, ...ITEMS];

  return (
    <div className="relative w-full overflow-hidden bg-surface-950 py-12 border-y border-white/[0.03] select-none">
      {/* Faded edges overlay */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 sm:w-48 bg-gradient-to-r from-surface-950 via-surface-950/80 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 sm:w-48 bg-gradient-to-l from-surface-950 via-surface-950/80 to-transparent" />

      <div className="flex w-full overflow-hidden">
        <div className="flex animate-[marquee_40s_linear_infinite] gap-16 whitespace-nowrap min-w-full">
          {doubledItems.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3.5 text-surface-400 hover:text-surface-50 transition-colors duration-300 group cursor-default"
            >
              <item.Icon className={`h-[18px] w-[18px] ${item.color} opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300`} />
              <span className="font-mono text-[10.5px] font-semibold tracking-[0.2em] uppercase">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
