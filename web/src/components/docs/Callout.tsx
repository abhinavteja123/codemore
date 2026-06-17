import { Info, AlertTriangle, Sparkles, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "note" | "warning" | "tip" | "important";

const ICONS: Record<Kind, ReactNode> = {
  note:       <Info className="w-3.5 h-3.5" />,
  warning:    <AlertTriangle className="w-3.5 h-3.5" />,
  tip:        <Sparkles className="w-3.5 h-3.5" />,
  important:  <ShieldAlert className="w-3.5 h-3.5" />,
};

interface Props {
  type?: Kind;
  title?: string;
  children: ReactNode;
}

export default function Callout({ type = "note", title, children }: Props) {
  return (
    <aside className={`callout callout-${type}`}>
      <div className="callout-head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {ICONS[type]} {title ?? type}
        </span>
      </div>
      <div className="callout-body">{children}</div>
    </aside>
  );
}
