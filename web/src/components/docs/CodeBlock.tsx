"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  lang?: string;
  children: string;
  /** Display label override (e.g. "shell · install via npm") */
  label?: string;
}

/**
 * Code block with language badge + copy button. No syntax highlighting —
 * we ship monospace with the brand-aligned dark surface and keep the
 * bundle small. shiki can be wired in later as a single-place upgrade.
 */
export default function CodeBlock({ lang = "text", children, label }: Props) {
  const [copied, setCopied] = useState(false);
  const code = children.trimEnd();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-meta">
        <span className="code-block-lang">{label ?? lang}</span>
        <button
          type="button"
          onClick={onCopy}
          className={"copy-btn " + (copied ? "is-copied" : "")}
          aria-label="Copy code"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="code-block-body">
        <pre><code>{code}</code></pre>
      </div>
    </div>
  );
}
