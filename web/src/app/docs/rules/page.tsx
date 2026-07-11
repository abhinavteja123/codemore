import Link from "next/link";

import { listRuleIds, loadRuleDoc } from "@/lib/docs";
import NextStep from "@/components/docs/NextStep";

export const metadata = {
  title: "CodeMore — Rules",
  description:
    "Browse every rule in the catalog: 59 native rules across 6 packs, plus 8 opt-in external-tool adapters.",
};

interface RuleSummary {
  id: string;
  title: string;
  pack: string;
  severity: string;
  languages: string;
  lifecycle: string;
}

/** Pull the metadata block out of a rule's markdown frontmatter-y header. */
function summarise(id: string, md: string | null): RuleSummary {
  const empty: RuleSummary = { id, title: id, pack: "-", severity: "-", languages: "-", lifecycle: "-" };
  if (!md) return empty;
  const lines = md.split("\n").slice(0, 30);
  const title = lines.find(l => l.startsWith("# "))?.replace(/^# /, "").trim() ?? id;
  const pack     = (lines.find(l => /^\*\*Pack:/i.test(l)) ?? "").replace(/^\*\*Pack:\*\*\s*/i, "").replace(/`/g, "").trim() || "-";
  let severity = (lines.find(l => /^\*\*Default severity:/i.test(l)) ?? "").replace(/^\*\*Default severity:\*\*\s*/i, "").replace(/`/g, "").trim().split(/\s+\(|$/)[0] || "-";
  const langs    = (lines.find(l => /^\*\*Languages:/i.test(l)) ?? "").replace(/^\*\*Languages:\*\*\s*/i, "").replace(/`/g, "").trim() || "-";
  let lifecycle = (lines.find(l => /^\*\*Lifecycle:/i.test(l)) ?? "").replace(/^\*\*Lifecycle:\*\*\s*/i, "").replace(/`/g, "").trim() || "-";
  // Fallback: some rule docs carry a `| Category | Default severity | Lifecycle | … |` table instead of metadata lines.
  if (severity === "-" || lifecycle === "-") {
    const headerIdx = lines.findIndex(l => l.startsWith("|") && /default severity/i.test(l));
    const valueRow = headerIdx >= 0 ? lines.slice(headerIdx + 1, headerIdx + 3).find(l => l.startsWith("|") && !/^\|[\s:-]+\|/.test(l)) : undefined;
    if (headerIdx >= 0 && valueRow) {
      const headers = lines[headerIdx].split("|").map(c => c.trim().toLowerCase());
      const cells = valueRow.split("|").map(c => c.trim());
      const sevIdx = headers.findIndex(h => h.includes("default severity"));
      const lifeIdx = headers.findIndex(h => h.includes("lifecycle"));
      if (severity === "-" && sevIdx >= 0 && cells[sevIdx]) severity = cells[sevIdx];
      if (lifecycle === "-" && lifeIdx >= 0 && cells[lifeIdx]) lifecycle = cells[lifeIdx];
    }
  }
  return { id, title, pack, severity, languages: langs, lifecycle };
}

const PACK_BLURB: Record<string, string> = {
  "core-security":   "Injection, weak crypto, secrets, path traversal, eval, deserialization — the universal SAST class.",
  "core-quality":    "Unused exports, complexity, dead conditionals, leftover prints, async-without-await — bug-class style smells.",
  "core-bugs":       "Loose equality, TODO/FIXME markers, latent bug patterns.",
  "core-typescript": "TypeScript-specific footguns: non-null assertions, any abuse.",
  "vibe-auth":       "Missing session checks, BOLA, inverted auth — the lovable Lovable bugs.",
  "vibe-frontend":   "XSS, CORS, missing rate limits, cookie flags, file-upload validation.",
  "vibe-secrets":    "Public env leaks, CI/CD secret echoes, MCP config secrets.",
  "vibe-supabase":   "RLS disabled, permissive policies, anon-key reachable from client.",
  "vibe-llm":        "LLM-output sinks, prompt-injection sinks, agent-tool-no-confirm.",
};

const PACK_BADGE_COLOR: Record<string, string> = {
  "core-security":   "rgba(255, 102, 102, 0.16)",
  "core-quality":    "rgba(78, 242, 202, 0.12)",
  "core-bugs":       "rgba(254, 188, 46, 0.16)",
  "core-typescript": "rgba(78, 242, 202, 0.12)",
  "vibe-auth":       "rgba(255, 184, 102, 0.16)",
  "vibe-frontend":   "rgba(131, 110, 243, 0.16)",
  "vibe-secrets":    "rgba(255, 122, 122, 0.16)",
  "vibe-supabase":   "rgba(123, 224, 159, 0.16)",
  "vibe-llm":        "rgba(189, 110, 243, 0.16)",
};

export default function RulesIndex() {
  const summaries = listRuleIds().map(id => summarise(id, loadRuleDoc(id)));
  const byPack = new Map<string, RuleSummary[]>();
  for (const s of summaries) {
    if (!byPack.has(s.pack)) byPack.set(s.pack, []);
    byPack.get(s.pack)!.push(s);
  }
  const packs = Array.from(byPack.keys()).sort();
  return (
    <>
      <h1>Rules ({summaries.length})</h1>
      <p className="lead">
        Every rule ships with a TP fixture + an FP fixture + a docs page + a
        registry entry — the PR bot enforces all four before a human reviews.
        Severity defaults are tunable per project via{" "}
        <code>.codemorerc.json</code>.
      </p>

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
                background: PACK_BADGE_COLOR[pack] ?? "rgba(255, 255, 255, 0.05)",
                fontWeight: 500,
              }}
            >
              {byPack.get(pack)!.length} rules
            </span>
          </h2>
          {PACK_BLURB[pack] && (
            <p style={{ marginTop: -4, marginBottom: 18, color: "rgba(245, 242, 235, 0.65)" }}>
              {PACK_BLURB[pack]}
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

      <NextStep
        href="/docs/contributing"
        title="Contribute a rule"
        description="Submit a rule module + TP + FP + docs + registry entry. The bot reviews first, a human after."
      />
    </>
  );
}
