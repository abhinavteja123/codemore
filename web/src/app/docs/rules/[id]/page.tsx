import Link from "next/link";
import { notFound } from "next/navigation";

import { listRuleIds, loadRuleDoc } from "@/lib/docs";
import { renderMarkdown } from "@/lib/markdown";
import NextStep from "@/components/docs/NextStep";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return listRuleIds().map(id => ({ id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `${id} — CodeMore`,
    description: `Rule reference for ${id}.`,
  };
}

export default async function RulePage({ params }: PageProps) {
  const { id } = await params;
  const md = loadRuleDoc(id);
  if (!md) notFound();
  return (
    <>
      <div className="mb-4 text-sm">
        <Link href="/docs/rules" className="text-[var(--gold-soft)] hover:text-white">
          ← all rules
        </Link>
      </div>
      {renderMarkdown(md)}
      <NextStep
        href="/docs/rules"
        title="Back to the catalog"
        description="See the other 57 rules — grouped by pack, with lifecycle gates."
      />
    </>
  );
}
