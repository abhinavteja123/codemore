"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  panel: ReactNode;
}

interface Props {
  tabs: Tab[];
  /** Default-active tab id. Falls back to the first tab. */
  defaultId?: string;
}

export default function SurfaceTabs({ tabs, defaultId }: Props) {
  const [active, setActive] = useState<string>(defaultId ?? tabs[0]?.id ?? "");

  // Sync with URL hash so deep-links like /docs/install#mcp land on the right tab.
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace("#", "");
      if (h && tabs.some(t => t.id === h)) setActive(h);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [tabs]);

  const onPick = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };

  const activeTab = tabs.find(t => t.id === active) ?? tabs[0];

  return (
    <>
      <div className="surface-tabs" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === activeTab?.id}
            className={"surface-tabs__tab " + (t.id === activeTab?.id ? "is-active" : "")}
            onClick={() => onPick(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="surface-tabs__panel" role="tabpanel">
        {activeTab?.panel}
      </div>
    </>
  );
}
