"use client";

import React, { useEffect, useState } from "react";

interface SidebarHUDBarsProps {
  sections: { id: string; label: string }[];
  activeSection?: string;
}

export default function SidebarHUDBars({ sections, activeSection: propActiveSection }: SidebarHUDBarsProps) {
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (propActiveSection !== undefined) {
      setActiveSection(propActiveSection);
      return;
    }

    const observerOptions = {
      root: null,
      rootMargin: "-45% 0px -45% 0px", // High precision matching for the center of screen
      threshold: 0,
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, observerOptions);

    sections.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) {observer.observe(el);}
    });

    return () => {
      sections.forEach((sec) => {
        const el = document.getElementById(sec.id);
        if (el) {observer.unobserve(el);}
      });
    };
  }, [sections, propActiveSection]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div 
      className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-5 pointer-events-auto select-none sm:flex"
      id="sidebar-hud"
    >
      {sections.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <button
            key={section.id}
            onClick={() => scrollToSection(section.id)}
            className="group flex items-center gap-3 bg-transparent border-0 cursor-pointer p-1 focus:outline-none"
            aria-label={`Scroll to ${section.label}`}
          >
            {/* Tooltip Label */}
            <span 
              className={`text-[10px] font-mono tracking-widest uppercase transition-all duration-300 transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 ${
                isActive ? "text-[#4ef2ca] !opacity-100 !translate-x-0" : "text-gray-400"
              }`}
            >
              {section.label}
            </span>

            {/* Indicator Node */}
            <div className="relative flex items-center justify-center w-5 h-5">
              {/* Outer Pulsing Aura */}
              <div 
                className={`absolute inset-0 rounded-full border transition-all duration-500 scale-50 opacity-0 ${
                  isActive 
                    ? "border-[#4ef2ca] scale-100 opacity-100 bg-[#4ef2ca]/5 animate-pulse" 
                    : "border-transparent"
                }`}
              />

              {/* Core Node dot */}
              <div 
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  isActive 
                    ? "bg-[#4ef2ca] scale-125" 
                    : "bg-gray-600 group-hover:bg-gray-400 group-hover:scale-110"
                }`}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
