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
  const chartHeight = 100;

  // Determine trend icon and color
  const TrendIcon = data.trend === "improving" ? TrendingUp : data.trend === "worsening" ? TrendingDown : Minus;
  const trendColor =
    data.trend === "improving" ? "text-green-400" : data.trend === "worsening" ? "text-red-400" : "text-surface-400";
  const trendLabel =
    data.trend === "improving" ? "Improving" : data.trend === "worsening" ? "Worsening" : "Stable";

  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-surface-400">
          <Activity size={16} /> Health History
        </h3>
        <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
          <TrendIcon size={16} />
          <span>{trendLabel}</span>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-lg bg-surface-800/50 p-3 text-center">
          <div className="text-2xl font-bold text-white">{data.weeklyAverage}</div>
          <div className="text-xs text-surface-500">7-day avg</div>
        </div>
        <div className="rounded-lg bg-surface-800/50 p-3 text-center">
          <div className="text-2xl font-bold text-white">{data.monthlyAverage}</div>
          <div className="text-xs text-surface-500">30-day avg</div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-24">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[100, 75, 50, 25, 0].map((val) => (
            <div key={val} className="flex items-center gap-2">
              <span className="text-[10px] text-surface-600 w-6 text-right">{val}</span>
              <div className="flex-1 border-b border-surface-800/50" />
            </div>
          ))}
        </div>

        {/* Line chart */}
        <svg className="absolute inset-0 w-full h-full ml-8" preserveAspectRatio="none">
          {/* Area fill */}
          <defs>
            <linearGradient id="healthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(168 85 247)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(168 85 247)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={
              sortedSnapshots.length > 1
                ? `M0,${chartHeight - (sortedSnapshots[0].healthScore / maxScore) * chartHeight} ` +
                  sortedSnapshots
                    .map(
                      (s, i) =>
                        `L${(i / (sortedSnapshots.length - 1)) * 100}%,${
                          chartHeight - (s.healthScore / maxScore) * chartHeight
                        }`
                    )
                    .join(" ") +
                  ` L100%,${chartHeight} L0,${chartHeight} Z`
                : ""
            }
            fill="url(#healthGradient)"
          />
          {/* Line */}
          <polyline
            fill="none"
            stroke="rgb(168 85 247)"
            strokeWidth="2"
            points={sortedSnapshots
              .map(
                (s, i) =>
                  `${(i / Math.max(sortedSnapshots.length - 1, 1)) * 100}%,${
                    chartHeight - (s.healthScore / maxScore) * chartHeight
                  }`
              )
              .join(" ")}
          />
          {/* Data points */}
          {sortedSnapshots.map((s, i) => (
            <circle
              key={s.id}
              cx={`${(i / Math.max(sortedSnapshots.length - 1, 1)) * 100}%`}
              cy={chartHeight - (s.healthScore / maxScore) * chartHeight}
              r="3"
              fill="rgb(168 85 247)"
            />
          ))}
        </svg>
      </div>

      {/* Timeline labels */}
      {sortedSnapshots.length > 1 && (
        <div className="flex justify-between mt-2 ml-8 text-[10px] text-surface-500">
          <span>{new Date(sortedSnapshots[0].scannedAt).toLocaleDateString()}</span>
          <span>{new Date(sortedSnapshots[sortedSnapshots.length - 1].scannedAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
