"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Navigation, Play, Pause } from "lucide-react";

interface PageTransitionIndicatorProps {
  sections: string[];
}

export default function PageTransitionIndicator({ sections }: PageTransitionIndicatorProps) {
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);

  // Track overall scroll percentage
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight <= 0) return;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle auto-scroll presentation loops
  useEffect(() => {
    if (!isAutoScrolling) return;

    let animationFrameId: number;
    const scrollSpeed = 0.8; // px per tick

    const performSmoothScroll = () => {
      const position = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      if (position >= maxScroll - 2) {
        setIsAutoScrolling(false);
        return;
      }

      window.scrollTo(0, position + scrollSpeed);
      animationFrameId = requestAnimationFrame(performSmoothScroll);
    };

    animationFrameId = requestAnimationFrame(performSmoothScroll);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isAutoScrolling]);

  // Navigate to closest section in current orientation
  const scrollToNextAnchor = () => {
    const scrollPos = window.scrollY;
    let nextEl: HTMLElement | null = null;

    for (const sectionId of sections) {
      const el = document.getElementById(sectionId);
      if (el) {
        const offsetTop = el.offsetTop;
        if (offsetTop > scrollPos + 30) {
          nextEl = el;
          break;
        }
      }
    }

    if (nextEl) {
      nextEl.scrollIntoView({ behavior: "smooth" });
    } else {
      // scroll to top if at end
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <>
      {/* 1. Global top viewport progress bar */}
      <div 
        className="fixed top-0 left-0 h-[3px] bg-gradient-to-r from-teal-400 via-emerald-400 to-indigo-500 z-[250] transition-all duration-75"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden="true"
      />

      {/* 2. Scroll Presentation HUD Controller */}
      <div className="fixed left-6 bottom-6 z-[150] flex items-center bg-[#06060c]/80 border border-gray-900 p-2.5 rounded-xl backdrop-blur-xl">
        <button
          onClick={scrollToNextAnchor}
          className="p-1.5 px-3 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider"
          title="Scroll down to next structural section block"
        >
          <span>Next Section</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </button>
      </div>
    </>
  );
}
