import { listRuleIds, loadRuleDoc } from "@/lib/docs";
import NextStep from "@/components/docs/NextStep";
import RulesExplorer, { type RuleSummary } from "@/components/docs/RulesExplorer";

export const metadata = {
  title: "CodeMore — Rules",
  description:
    "Browse every rule in the catalog: 64 native rules across 6 packs, plus 8 opt-in external-tool adapters.",
};

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
  return (
    <>
      <h1>Rules ({summaries.length})</h1>
      <p className="lead">
        Every rule ships with a TP fixture + an FP fixture + a docs page + a
        registry entry — the PR bot enforces all four before a human reviews.
        Severity defaults are tunable per project via{" "}
        <code>.codemorerc.json</code>.
      </p>

      <RulesExplorer summaries={summaries} packBlurb={PACK_BLURB} badgeColor={PACK_BADGE_COLOR} />

      <NextStep
        href="/docs/contributing"
        title="Contribute a rule"
        description="Submit a rule module + TP + FP + docs + registry entry. The bot reviews first, a human after."
      />
    </>
  );
}
