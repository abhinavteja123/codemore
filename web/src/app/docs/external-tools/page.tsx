import { notFound } from 'next/navigation';
import { loadDocPage } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = { title: 'External tools — CodeMore' };

export default function ExternalToolsPage() {
  const page = loadDocPage('external-tools');
  if (!page) notFound();
  return <>{renderMarkdown(page.content)}</>;
}
