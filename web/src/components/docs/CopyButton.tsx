"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard button for server-rendered markdown code blocks
 * (lib/markdown.tsx). Positioning + hover-reveal live in
 * landing-designed.css (.md-code-block / .md-copy-btn).
 */
export default function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={"copy-btn md-copy-btn" + (copied ? " is-copied" : "")}
      aria-label="Copy code"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
