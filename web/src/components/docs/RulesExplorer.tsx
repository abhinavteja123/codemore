"use client";

import { useState } from "react";
import Link from "next/link";

export interface RuleSummary {
  id: string;
  title: string;
  pack: string;
  severity: string;
  languages: string;
  lifecycle: string;
}

interface Props {
  summaries: RuleSummary[];
  packBlurb: Record<string, string>;
  badgeColor: Record<string, string>;
}

/**
 * Client-side search/filter over the rule catalog. The server page loads
 * the summaries from disk; this just filters and renders them.
 */
export default function RulesExplorer({ summaries, packBlurb, badgeColor }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? summaries.filter(s =>
        [s.id, s.title, s.severity, s.pack].some(f => f.toLowerCase().includes(q)),
      )
    : summaries;

  const byPack = new Map<string, RuleSummary[]>();
  for (const s of filtered) {
    if (!byPack.has(s.pack)) byPack.set(s.pack, []);
    byPack.get(s.pack)!.push(s);
  }
  const packs = Array.from(byPack.keys()).sort();

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          margin: "20px 0 8px",
        }}
      >
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Filter by id, title, severity, pack…"
          aria-label="Filter rules"
          style={{
            flex: "1 1 260px",
            maxWidth: 420,
            padding: "10px 14px",
            borderRadius: 8,
            border: `1px solid ${focused ? "var(--gold)" : "rgba(255, 255, 255, 0.08)"}`,
            background: "rgba(8, 10, 22, 0.5)",
            color: "var(--fg)",
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            outline: "none",
            transition: "border-color 0.2s ease",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(245, 242, 235, 0.5)",
            whiteSpace: "nowrap",
          }}
        >
          {filtered.length} of {summaries.length}
        </span>
      </div>

      {packs.map(pack => (
        <section key={pack} id={pack.toLowerCase()}>
          <h2 style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span>{pack}</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--gold-soft)",
                padding: "3px 9px",
                borderRadius: 6,
                background: badgeColor[pack] ?? "rgba(255, 255, 255, 0.05)",
                fontWeight: 500,
              }}
            >
              {byPack.get(pack)!.length} rules
            </span>
          </h2>
          {packBlurb[pack] && (
            <p style={{ marginTop: -4, marginBottom: 18, color: "rgba(245, 242, 235, 0.65)" }}>
              {packBlurb[pack]}
            </p>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
              margin: "12px 0 28px",
            }}
          >
            {byPack.get(pack)!.map(s => (
              <Link
                key={s.id}
                href={`/docs/rules/${s.id}`}
                style={{
                  display: "block",
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  background: "rgba(8, 10, 22, 0.5)",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 0.25s ease, transform 0.25s ease",
                }}
                className="rule-card"
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--gold-soft)",
                    marginBottom: 4,
                    wordBreak: "break-word",
                  }}
                >
                  {s.id}
                </div>
                <div style={{ fontSize: 13.5, marginBottom: 8, color: "var(--fg)", fontWeight: 500 }}>
                  {s.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    color: "rgba(245, 242, 235, 0.5)",
                    textTransform: "uppercase",
                    flexWrap: "wrap",
                  }}
                >
                  {s.severity !== "-" && <span>{s.severity}</span>}
                  {s.languages !== "-" && <span>· {s.languages}</span>}
                  {s.lifecycle !== "-" && <span>· {s.lifecycle}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "rgba(245, 242, 235, 0.5)",
            margin: "24px 0",
          }}
        >
          No rules match “{query.trim()}”.
        </p>
      )}
    </>
  );
}
