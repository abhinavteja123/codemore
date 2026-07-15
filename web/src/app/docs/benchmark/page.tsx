import { notFound } from 'next/navigation';
import { loadDocPage } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = { title: '50-app benchmark — CodeMore' };

export default function BenchmarkPage() {
  const page = loadDocPage('benchmark');
  if (!page) notFound();
  return <>{renderMarkdown(page.content)}</>;
}
