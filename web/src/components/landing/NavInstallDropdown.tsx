"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Terminal, Boxes, Code2, GitPullRequest, Globe, Copy, Check, ChevronDown } from "lucide-react";

type Surface = "cli" | "mcp" | "vscode" | "action" | "web";

const SURFACES: Array<{
  id: Surface;
  label: string;
  blurb: string;
  cmd: string;
  href: string;
  icon: React.ReactNode;
}> = [
  { id: "cli",    label: "CLI",           blurb: "One-off scan · CI gate",          cmd: "npx codemore@latest scan .",         href: "/docs/install#cli",    icon: <Terminal className="w-4 h-4" /> },
  { id: "mcp",    label: "MCP server",    blurb: "Cursor · Claude Code · Codex",    cmd: "npx codemore serve-mcp",             href: "/docs/install#mcp",    icon: <Boxes className="w-4 h-4" /> },
  { id: "vscode", label: "VS Code",       blurb: "Inline diagnostics · code action", cmd: "code --install-extension codemore-0.2.1.vsix", href: "/docs/install#vscode", icon: <Code2 className="w-4 h-4" /> },
  { id: "action", label: "GitHub Action", blurb: "PR comment · auto-fix branch",     cmd: "uses: codemore-dev/codemore-action@v1", href: "/docs/install#action", icon: <GitPullRequest className="w-4 h-4" /> },
  { id: "web",    label: "Web Scanner",   blurb: "Sign in · scan a repo URL",        cmd: "sign-in to scan via web",            href: "/dashboard",            icon: <Globe className="w-4 h-4" /> },
];

interface Props {
  onWebScanner?: () => void;
}

export default function NavInstallDropdown({ onWebScanner }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<Surface | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = async (s: Surface, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(s);
      setTimeout(() => setCopied(null), 1500);
    } catch {/* ignore */}
  };

  return (
    <div ref={rootRef} className="nav__dropdown-root">
      <button
        type="button"
        className={"nav__dropdown-trigger " + (open ? "is-open" : "")}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        Install
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="nav__dropdown-panel" role="menu">
          <div className="nav__dropdown-eyebrow">install in 30 seconds</div>
          <div className="nav__dropdown-cmd">
            <span className="nav__dropdown-cmd-prompt">$</span>
            <code>npx codemore@latest scan .</code>
            <button
              type="button"
              onClick={() => copy("cli", "npx codemore@latest scan .")}
              className="nav__dropdown-copy"
              aria-label="Copy install command"
            >
              {copied === "cli" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="nav__dropdown-rows">
            {SURFACES.map(s => (
              <div key={s.id} className="nav__dropdown-row">
                <div className="nav__dropdown-row-icon">{s.icon}</div>
                <div className="nav__dropdown-row-text">
                  <div className="nav__dropdown-row-label">{s.label}</div>
                  <div className="nav__dropdown-row-blurb">{s.blurb}</div>
                </div>
                <div className="nav__dropdown-row-cta">
                  {s.id === "web" ? (
                    <button
                      type="button"
                      onClick={() => { setOpen(false); onWebScanner?.(); }}
                      className="nav__dropdown-go"
                    >
                      Sign in →
                    </button>
                  ) : (
                    <Link
                      href={s.href}
                      onClick={() => setOpen(false)}
                      className="nav__dropdown-go"
                    >
                      Docs →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="nav__dropdown-footer">
            <Link href="/docs/install" onClick={() => setOpen(false)}>Full install guide →</Link>
            <span>v0.2.1 · MIT</span>
          </div>
        </div>
      )}
    </div>
  );
}
