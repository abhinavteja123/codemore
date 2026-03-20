"use client";

interface HealthScoreProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export default function HealthScore({ score, size = "md" }: HealthScoreProps) {
  const getColor = (s: number) => {
    if (s >= 80) return "#4caf50";
    if (s >= 60) return "#ff9800";
    return "#f44336";
  };

  const color = getColor(score);

  const dims = {
    sm: { w: 80, h: 80, text: "text-2xl", label: "text-[9px]", inset: "inset-1.5" },
    md: { w: 120, h: 120, text: "text-4xl", label: "text-xs", inset: "inset-2" },
    lg: { w: 160, h: 160, text: "text-5xl", label: "text-sm", inset: "inset-3" },
  }[size];

  return (
    <div
      className="relative rounded-full flex flex-col items-center justify-center"
      style={{
        width: dims.w,
        height: dims.h,
        background: `conic-gradient(${color} ${score * 3.6}deg, #1e293b ${score * 3.6}deg)`,
      }}
    >
      <div className={`absolute ${dims.inset} rounded-full bg-surface-900`} />
      <span className={`relative z-10 font-bold ${dims.text} text-white`}>
        {Math.round(score)}
      </span>
      <span className={`relative z-10 ${dims.label} text-surface-400`}>
        Health
      </span>
    </div>
  );
}
