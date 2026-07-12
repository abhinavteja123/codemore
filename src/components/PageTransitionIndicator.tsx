import React from "react";
import { ChevronDown } from "lucide-react";

interface PageTransitionIndicatorProps {
  sections: string[];
  onNextSection?: () => void;
  progressBarRef?: React.RefObject<HTMLDivElement | null>;
}

export default function PageTransitionIndicator({ onNextSection, progressBarRef }: PageTransitionIndicatorProps) {
  return (
    <>
      {/* 1. Global top viewport progress bar - driven entirely by CSS variable --scroll-p */}
      <div 
        ref={progressBarRef}
        className="progress-bar"
        aria-hidden="true"
      />

      {/* 2. Scroll Presentation HUD Controller */}
      <div className="fixed left-6 bottom-6 z-[150] flex items-center bg-[#06060c]/80 border border-gray-900 p-2.5 rounded-xl backdrop-blur-xl">
        <button
          onClick={onNextSection}
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
