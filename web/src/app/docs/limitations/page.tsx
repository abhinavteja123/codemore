import { notFound } from 'next/navigation';
import { loadDocPage } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = { title: 'Limitations — CodeMore' };

export default function LimitationsPage() {
  const page = loadDocPage('limitations');
  if (!page) notFound();
  return <>{renderMarkdown(page.content)}</>;
}
