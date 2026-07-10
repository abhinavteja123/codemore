/**
 * Tiny markdown renderer.
 *
 * Built deliberately small so it ships without a marked/remark
 * dependency. Recognises:
 *   - ATX headings (#, ##, ### …)
 *   - Fenced code blocks (```lang … ```)
 *   - Inline `code` spans
 *   - **bold** and *italic*
 *   - [link text](url) links
 *   - Ordered + unordered lists (single-level)
 *   - GitHub-flavoured pipe tables
 *   - Blockquotes
 *   - Horizontal rule (---)
 *
 * Anything else falls through as paragraph text. The output is React
 * elements with Tailwind `prose` styling.
 */

import type { ReactNode } from 'react';
import React from 'react';


function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (n: ReactNode) => out.push(<React.Fragment key={key++}>{n}</React.Fragment>);

  // Process character by character, recognising inline patterns.
  while (i < text.length) {
    // [text](url)
    if (text[i] === '[') {
      const close = text.indexOf(']', i);
      if (close > -1 && text[close + 1] === '(') {
        const end = text.indexOf(')', close + 1);
        if (end > -1) {
          const label = text.slice(i + 1, close);
          const url = text.slice(close + 2, end);
          push(<a href={url} className="text-emerald-700 hover:underline dark:text-emerald-400">{label}</a>);
          i = end + 1;
          continue;
        }
      }
    }
    // `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > -1) {
        push(<code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // **bold**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > -1) {
        push(<strong>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    // *italic*
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > -1) {
        push(<em>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    // plain char
    const next = Math.min(
      ...['[', '`', '*'].map(c => {
        const idx = text.indexOf(c, i + 1);
        return idx === -1 ? text.length : idx;
      }),
    );
    push(text.slice(i, next));
    i = next;
  }
  return <>{out}</>;
}

function renderTable(lines: string[]): ReactNode {
  // lines[0] = header row, lines[1] = separator, rest = body
  const split = (s: string) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  const headers = split(lines[0]);
  const rows = lines.slice(2).map(split);
  return (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-300 dark:border-zinc-700">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold">{renderInline(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-zinc-100 dark:border-zinc-800">
              {row.map((c, ci) => (
                <td key={ci} className="px-3 py-2 align-top">{renderInline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function renderMarkdown(md: string): ReactNode {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
  let key = 0;
  const k = () => key++;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(
        <pre key={k()} className="my-4 overflow-x-auto rounded bg-zinc-100 p-4 dark:bg-zinc-900">
          <code className={`language-${lang} font-mono text-sm`}>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    // Heading
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const Tag = (`h${Math.min(6, level)}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      out.push(<Tag key={k()}>{renderInline(m[2])}</Tag>);
      i++;
      continue;
    }
    // Horizontal rule
    if (/^-{3,}\s*$/.test(line)) {
      out.push(<hr key={k()} className="my-6 border-zinc-200 dark:border-zinc-800" />);
      i++;
      continue;
    }
    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(<React.Fragment key={k()}>{renderTable(tableLines)}</React.Fragment>);
      continue;
    }
    // Blockquote
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <blockquote key={k()} className="my-4 border-l-4 border-zinc-300 pl-4 italic text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
          {buf.map((b, idx) => <div key={idx}>{renderInline(b)}</div>)}
        </blockquote>,
      );
      continue;
    }
    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={k()} className="my-3 list-disc pl-6">
          {items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}
        </ul>,
      );
      continue;
    }
    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={k()} className="my-3 list-decimal pl-6">
          {items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}
        </ol>,
      );
      continue;
    }
    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Paragraph: greedy until blank line.
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```')) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length > 0) {
      out.push(<p key={k()}>{renderInline(buf.join(' '))}</p>);
    }
  }

  return <>{out}</>;
}
