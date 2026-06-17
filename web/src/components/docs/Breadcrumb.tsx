"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Reads the current pathname (`/docs/install`) and renders a breadcrumb
 * (Docs / Install). Hide on the docs home itself.
 */
export default function Breadcrumb() {
  const pathname = usePathname() ?? "";
  if (!pathname.startsWith("/docs")) return null;
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length <= 1) return null;
  const crumbs = parts.map((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const label = p.replace(/-/g, " ");
    return { href, label, isLast: i === parts.length - 1 };
  });
  return (
    <nav className="docs-breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {c.isLast ? (
            <span>{c.label}</span>
          ) : (
            <Link href={c.href}>{c.label}</Link>
          )}
          {i < crumbs.length - 1 && <span className="docs-breadcrumb-sep">/</span>}
        </span>
      ))}
    </nav>
  );
}
