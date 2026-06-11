import { notFound } from 'next/navigation';
import { loadDocPage } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = { title: 'CI security gate — CodeMore' };

export default function SecurityGatePage() {
  const page = loadDocPage('security-gate');
  if (!page) notFound();
  return <>{renderMarkdown(page.content)}</>;
}
