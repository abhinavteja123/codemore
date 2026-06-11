"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { HealthSnapshot } from "@/lib/database";

interface HealthHistoryChartProps {
  projectId: string;
}

interface HealthHistoryData {
  snapshots: HealthSnapshot[];
  trend: "improving" | "worsening" | "stable";
  weeklyAverage: number;
  monthlyAverage: number;
}

export default function HealthHistoryChart({ projectId }: HealthHistoryChartProps) {
  const [data, setData] = useState<HealthHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/projects/${projectId}?includeHistory=true&historyLimit=30`);
        if (!res.ok) throw new Error("Failed to fetch history");
        const json = await res.json();
        if (json.healthHistory) {
          setData(json.healthHistory);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [projectId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-surface-400">
          <Activity size={16} /> Health History
        </h3>
        <div className="flex items-center justify-center h-32 text-surface-500">
          Loading history...
        </div>
      </div>
    );
  }

  if (error || !data || data.snapshots.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-surface-400">
          <Activity size={16} /> Health History
        </h3>
        <div className="flex items-center justify-center h-32 text-surface-500">
          {error ? `Error: ${error}` : "No history available yet. Run scans to build history."}
        </div>
      </div>
    );
  }

  // Reverse to get chronological order for chart
  const sortedSnapshots = [...data.snapshots].reverse();
  const maxScore = 100;

  // Determine trend icon and color
  const TrendIcon = data.trend === "improving" ? TrendingUp : data.trend === "worsening" ? TrendingDown : Minus;
  const trendColor =
    data.trend === "improving" ? "text-emerald-400" : data.trend === "worsening" ? "text-rose-400" : "text-surface-400";
  const trendLabel =
    data.trend === "improving" ? "Improving" : data.trend === "worsening" ? "Worsening" : "Stable";

  // Map snapshot points to viewBox space (width 500, height 100)
  const paddingX = 8;
  const paddingY = 8;
  const pts = sortedSnapshots.map((s, i) => {
    const x = paddingX + (i / Math.max(sortedSnapshots.length - 1, 1)) * (500 - paddingX * 2);
    // Score is 0-100, invert to map to SVG coordinates (0 is top, 100 is bottom)
    const y = paddingY + ((maxScore - s.healthScore) / maxScore) * (100 - paddingY * 2);
    return { x, y };
  });

  // Build smooth cubic Bezier path
  const buildSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 3;
      const cp1y = p0.y;
      const cp2x = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const linePath = buildSmoothPath(pts);
  const areaPath = pts.length > 0 
    ? `${linePath} L ${pts[pts.length - 1].x} 100 L ${pts[0].x} 100 Z` 
    : "";

  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-surface-400">
          <Activity size={16} className="text-brand-400" /> Health History
        </h3>
        <div className={`flex items-center gap-1.5 text-xs font-mono font-bold uppercase ${trendColor}`}>
          <TrendIcon size={14} />
          <span>{trendLabel}</span>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-white/[0.04] bg-surface-850/30 p-3 text-center">
          <div className="text-2xl font-bold text-white tracking-tight">{data.weeklyAverage}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-surface-500">7-day avg</div>
        </div>
        <div className="rounded-xl border border-white/[0.04] bg-surface-850/30 p-3 text-center">
          <div className="text-2xl font-bold text-white tracking-tight">{data.monthlyAverage}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-surface-500">30-day avg</div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-28">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[100, 75, 50, 25, 0].map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="text-[10px] text-surface-650 w-6 text-right font-mono">{val}</span>
              <div className="flex-1 border-b border-surface-800/40" />
            </div>
          ))}
        </div>

        {/* Line chart */}
        <svg 
          className="absolute inset-0 w-full h-full pl-8" 
          viewBox="0 0 500 100" 
          preserveAspectRatio="none"
        >
          {/* Gradients */}
          <defs>
            <linearGradient id="healthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(12, 142, 233)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(12, 142, 233)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(12, 142, 233)" />
              <stop offset="100%" stopColor="rgb(99, 102, 241)" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#healthGradient)" />
          )}

          {/* Line stroke */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Data points */}
          {pts.map((pt, i) => {
            const score = sortedSnapshots[i].healthScore;
            const scoreColor = score >= 80 ? "fill-emerald-400" : score >= 60 ? "fill-amber-400" : "fill-rose-400";
            return (
              <circle
                key={sortedSnapshots[i].id}
                cx={pt.x}
                cy={pt.y}
                r="3.5"
                className={`${scoreColor} stroke-surface-900 stroke-[2px] transition-all duration-200 hover:r-[5px]`}
              >
                <title>{`Score: ${Math.round(score)} — ${new Date(sortedSnapshots[i].scannedAt).toLocaleDateString()}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      {/* Timeline labels */}
      {sortedSnapshots.length > 1 && (
        <div className="flex justify-between mt-3 pl-8 text-[10px] font-mono text-surface-500">
          <span>{new Date(sortedSnapshots[0].scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <span>{new Date(sortedSnapshots[sortedSnapshots.length - 1].scannedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}

