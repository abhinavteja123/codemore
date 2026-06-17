"use client";

import { useEffect, useRef, useState } from "react";

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

interface Props {
  /** Optional pre-built heading list. If omitted, the TOC reads from the prose container. */
  headings?: Heading[];
}

export default function StickyTOC({ headings: provided }: Props) {
  const [headings, setHeadings] = useState<Heading[]>(provided ?? []);
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (provided) return;
    const proseEl = document.querySelector("main.docs-prose") || document.querySelector("main");
    if (!proseEl) return;
    const collected: Heading[] = [];
    proseEl.querySelectorAll<HTMLHeadingElement>("h2, h3").forEach(h => {
      let id = h.id;
      if (!id) {
        id = (h.textContent ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        h.id = id;
      }
      collected.push({
        id,
        text: h.textContent ?? "",
        level: (h.tagName === "H3" ? 3 : 2),
      });
    });
    setHeadings(collected);
  }, [provided]);

  useEffect(() => {
    if (!headings.length) return;
    const els = headings
      .map(h => document.getElementById(h.id))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-100px 0px -65% 0px", threshold: 0.01 },
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [headings]);

  if (!headings.length) return null;

  return (
    <nav className="docs-toc" ref={rootRef} aria-label="On this page">
      <div className="docs-toc__head">On this page</div>
      <ul>
        {headings.map(h => (
          <li key={h.id} className={h.level === 3 ? "is-h3" : ""}>
            <a
              href={`#${h.id}`}
              className={active === h.id ? "is-active" : ""}
              onClick={e => {
                const el = document.getElementById(h.id);
                if (el) {
                  e.preventDefault();
                  const top = el.getBoundingClientRect().top + window.scrollY - 80;
                  window.scrollTo({ top, behavior: "smooth" });
                  history.replaceState(null, "", `#${h.id}`);
                }
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
