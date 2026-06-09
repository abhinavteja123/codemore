import Link from 'next/link';
import { listRuleIds, loadRuleDoc } from '@/lib/docs';

export const metadata = {
  title: 'CodeMore — Rules',
  description: 'Browse every rule in the catalog.',
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
  const empty: RuleSummary = { id, title: id, pack: '-', severity: '-', languages: '-', lifecycle: '-' };
  if (!md) return empty;
  const lines = md.split('\n').slice(0, 30);
  const title = lines.find(l => l.startsWith('# '))?.replace(/^# /, '').trim() ?? id;
  const pack     = (lines.find(l => /^\*\*Pack:/i.test(l)) ?? '').replace(/^\*\*Pack:\*\*\s*/i, '').replace(/`/g, '').trim() || '-';
  const severity = (lines.find(l => /^\*\*Default severity:/i.test(l)) ?? '').replace(/^\*\*Default severity:\*\*\s*/i, '').replace(/`/g, '').trim().split(/\s+\(|$/)[0] || '-';
  const langs    = (lines.find(l => /^\*\*Languages:/i.test(l)) ?? '').replace(/^\*\*Languages:\*\*\s*/i, '').replace(/`/g, '').trim() || '-';
  const lifecycle = (lines.find(l => /^\*\*Lifecycle:/i.test(l)) ?? '').replace(/^\*\*Lifecycle:\*\*\s*/i, '').replace(/`/g, '').trim() || '-';
  return { id, title, pack, severity, languages: langs, lifecycle };
}

export default function RulesIndex() {
  const summaries = listRuleIds().map(id => summarise(id, loadRuleDoc(id)));
  // Group by pack.
  const byPack = new Map<string, RuleSummary[]>();
  for (const s of summaries) {
    if (!byPack.has(s.pack)) byPack.set(s.pack, []);
    byPack.get(s.pack)!.push(s);
  }
  const packs = Array.from(byPack.keys()).sort();
  return (
    <>
      <h1>Rules ({summaries.length})</h1>
      <p>
        Each rule has a TP / FP fixture pair (see <code>corpus/rules/</code>) and a per-rule
        documentation page. Severity defaults can be promoted or suppressed per project via{' '}
        <code>.codemorerc.json</code>.
      </p>
      {packs.map(pack => (
        <section key={pack}>
          <h2>{pack}</h2>
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Severity</th>
                <th>Languages</th>
                <th>Lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {byPack.get(pack)!.map(s => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/docs/rules/${s.id}`} className="font-mono text-xs">
                      {s.id}
                    </Link>
                    <div className="text-xs text-zinc-500">{s.title}</div>
                  </td>
                  <td>{s.severity}</td>
                  <td>{s.languages}</td>
                  <td>{s.lifecycle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
