import { notFound } from 'next/navigation';
import { loadDocPage } from '@/lib/docs';
import { renderMarkdown } from '@/lib/markdown';

export const metadata = { title: 'GitHub Action — CodeMore' };

export default function GitHubActionPage() {
  const page = loadDocPage('github-action');
  if (!page) notFound();
  return <>{renderMarkdown(page.content)}</>;
}
