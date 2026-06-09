import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRuleIds, loadRuleDoc } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

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
        <Link href="/docs/rules" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← all rules
        </Link>
      </div>
      {renderMarkdown(md)}
    </>
  );
}
