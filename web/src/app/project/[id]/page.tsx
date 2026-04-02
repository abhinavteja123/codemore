"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import HealthScore from "@/components/HealthScore";
import HealthHistoryChart from "@/components/HealthHistoryChart";
import SeverityBadge from "@/components/SeverityBadge";
import CategoryBadge from "@/components/CategoryBadge";
import { toast } from "sonner";
import { waitForScanJobCompletion } from "@/lib/scanJobClient";
import { generateSarif } from "@/lib/sarif";
import {
  ArrowLeft,
  Bug,
  AlertTriangle,
  Gauge,
  Shield,
  Wrench,
  Accessibility,
  Star,
  FileText,
  Target,
  Zap,
  Search,
  X,
  Filter,
  Download,
  BarChart3,
  Clock,
  Code2,
  FolderTree,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  RefreshCw,
  Github,
  Upload,
  Trash2,
  History,
  FileJson,
  Copy,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  Key,
} from "lucide-react";
import {
  Project,
  CodeIssue,
  CodeSuggestion,
  Severity,
  IssueCategory,
  ScanHistoryEntry,
  ProjectFile,
  AiSettings,
  AiProvider,
} from "@/lib/types";

type Tab = "overview" | "issues" | "files" | "history";

const severityColors: Record<Severity, string> = {
  BLOCKER: "#d32f2f",
  CRITICAL: "#f44336",
  MAJOR: "#ff9800",
  MINOR: "#2196f3",
  INFO: "#9e9e9e",
};

const severityOrder: Record<Severity, number> = {
  BLOCKER: 0,
  CRITICAL: 1,
  MAJOR: 2,
  MINOR: 3,
  INFO: 4,
};

const categoryIcons: Record<IssueCategory, React.ReactNode> = {
  bug: <Bug size={16} />,
  "code-smell": <AlertTriangle size={16} />,
  performance: <Gauge size={16} />,
  security: <Shield size={16} />,
  maintainability: <Wrench size={16} />,
  accessibility: <Accessibility size={16} />,
  "best-practice": <Star size={16} />,
};

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.id);
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverities, setSelectedSeverities] = useState<Set<Severity>>(
    new Set()
  );
  const [selectedCategories, setSelectedCategories] = useState<
    Set<IssueCategory>
  >(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<CodeIssue | null>(null);
  const [suggestionsByIssue, setSuggestionsByIssue] = useState<Record<string, CodeSuggestion[]>>({});
  const [generatingFixIssueId, setGeneratingFixIssueId] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [reanalyzing, setReanalyzing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  // AI Settings state (matches extension pattern)
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    aiProvider: "openai",
    apiKey: "",
  });
  const [showAiSettings, setShowAiSettings] = useState(false);

  // Ref for scrolling to selected issue panel
  const selectedIssuePanelRef = useRef<HTMLDivElement>(null);

  // Scroll to selected issue panel when issue is selected
  useEffect(() => {
    if (selectedIssue && selectedIssuePanelRef.current) {
      setTimeout(() => {
        selectedIssuePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [selectedIssue]);

  // Load AI settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("codemore_ai_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AiSettings;
        setAiSettings(parsed);
      } catch {
        // Invalid saved settings, use defaults
      }
    }
  }, []);

  // Save AI settings to localStorage
  const saveAiSettings = () => {
    localStorage.setItem("codemore_ai_settings", JSON.stringify(aiSettings));
    toast.success("AI settings saved");
    setShowAiSettings(false);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      const saved = localStorage.getItem("codemore_projects");
      let localProject: Project | null = null;

      if (saved) {
        try {
          const projects: Project[] = JSON.parse(saved);
          localProject = projects.find((p) => p.id === projectId) || null;
        } catch {
          localProject = null;
        }
      }

      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          const apiProject = data.project as Project;
          const mergedProject: Project = {
            ...apiProject,
            files: apiProject.files?.length ? apiProject.files : (localProject?.files || []),
          };

          if (!cancelled) {
            setProject(mergedProject);
            setNotFound(false);
          }
          return;
        }
      } catch {
        // fall back to local cache below
      }

      if (!cancelled) {
        if (localProject) {
          setProject(localProject);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      }
    }

    loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Fetch scan history from DB
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/projects/${projectId}/scans`);
        if (res.ok) {
          const data = await res.json();
          if (data.scans) {
            setScanHistory(
              data.scans.map((s: any) => ({
                id: s.id,
                overallScore: s.overall_score,
                filesAnalyzed: s.files_analyzed,
                issueCount: s.issue_count,
                linesOfCode: s.lines_of_code,
                techDebtMinutes: s.tech_debt_minutes,
                scannedAt: s.scanned_at,
              }))
            );
          }
        }
      } catch { /* DB not configured */ }
    }
    if (projectId) loadHistory();
  }, [projectId, reanalyzing]);

  const metrics = project?.metrics;
  const issues = useMemo(() => project?.issues || [], [project?.issues]);
  const selectedIssueSuggestions = selectedIssue ? suggestionsByIssue[selectedIssue.id] || [] : [];

  const handleGenerateFix = async (issue: CodeIssue) => {
    // Validate AI settings before generating
    if (!aiSettings.apiKey) {
      toast.error("Please configure your AI API key in the AI Settings section below");
      setShowAiSettings(true);
      return;
    }

    setGeneratingFixIssueId(issue.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.id,
          includeRelatedFiles: true,
          aiProvider: aiSettings.aiProvider,
          apiKey: aiSettings.apiKey,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to generate fix suggestions");
      }

      setSuggestionsByIssue((prev) => ({
        ...prev,
        [issue.id]: Array.isArray(payload.suggestions) ? payload.suggestions : [],
      }));
      if ((payload.suggestions || []).length === 0) {
        toast.info("No suggestions were generated for this issue.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate fix suggestions");
    }
    setGeneratingFixIssueId(null);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCachedSuggestions() {
      if (!selectedIssue) {
        return;
      }
      if (suggestionsByIssue[selectedIssue.id]) {
        return;
      }

      try {
        const res = await fetch(
          `/api/projects/${projectId}/suggestions?issueId=${encodeURIComponent(selectedIssue.id)}`
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) {
          return;
        }

        if (Array.isArray(payload.suggestions) && payload.suggestions.length > 0) {
          setSuggestionsByIssue((prev) => ({
            ...prev,
            [selectedIssue.id]: payload.suggestions,
          }));
        }
      } catch {
        // Ignore cache hydration failures and let manual generation continue to work.
      }
    }

    void loadCachedSuggestions();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedIssue, suggestionsByIssue]);

  // Filtered issues
  const filteredIssues = useMemo(() => {
    let result = [...issues];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.location.filePath.toLowerCase().includes(q)
      );
    }
    if (selectedSeverities.size > 0) {
      result = result.filter((i) => selectedSeverities.has(i.severity));
    }
    if (selectedCategories.size > 0) {
      result = result.filter((i) => selectedCategories.has(i.category));
    }
    result.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
    return result;
  }, [issues, searchQuery, selectedSeverities, selectedCategories]);

  // Group issues by file
  const issuesByFile = useMemo(() => {
    const map = new Map<string, CodeIssue[]>();
    for (const issue of issues) {
      const file = issue.location.filePath;
      const fileIssues = map.get(file) ?? [];
      fileIssues.push(issue);
      map.set(file, fileIssues);
    }
    return map;
  }, [issues]);

  // File language stats
  const fileStats = useMemo(() => {
    if (!project?.files) return {};
    const stats: Record<string, number> = {};
    for (const f of project.files) {
      const lang = f.language.toUpperCase() || "OTHER";
      stats[lang] = (stats[lang] || 0) + 1;
    }
    return stats;
  }, [project?.files]);

  // Reanalyze
  const handleReanalyze = async () => {
    if (!project) return;

    setReanalyzing(true);
    try {
      if (project.source === "github" && project.repoFullName) {
        const res = await fetch("/api/scan-jobs/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: project.name,
            projectId: project.id,
            repoFullName: project.repoFullName,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Failed to re-analyze repository");
        }

        let updated = payload.project as Project | null;
        if (!updated && payload.job?.id) {
          const completed = await waitForScanJobCompletion(payload.job.id);
          updated = completed.project;
        }
        if (!updated) {
          throw new Error("Completed scan did not return a project snapshot");
        }
        setProject(updated);
        const saved = localStorage.getItem("codemore_projects");
        if (saved) {
          const projects: Project[] = JSON.parse(saved);
          const idx = projects.findIndex((p) => p.id === project.id);
          if (idx !== -1) {
            projects[idx] = updated;
            localStorage.setItem("codemore_projects", JSON.stringify(projects));
          }
        }
        toast.success("Re-analysis complete");
        setReanalyzing(false);
        return;
      }

      const files: ProjectFile[] = project.files || [];
      if (files.length === 0) {
        throw new Error("Source files are unavailable for re-analysis");
      }

      const res = await fetch("/api/scan-jobs/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: project.name,
          source: project.source,
          repoFullName: project.repoFullName,
          files,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Re-analysis failed");
      }

      let updated = payload.project as Project | null;
      if (!updated && payload.job?.id) {
        const completed = await waitForScanJobCompletion(payload.job.id);
        updated = completed.project;
      }
      if (!updated) {
        throw new Error("Completed scan did not return a project snapshot");
      }
      setProject(updated);

      const saved = localStorage.getItem("codemore_projects");
      if (saved) {
        const projects: Project[] = JSON.parse(saved);
        const idx = projects.findIndex((p) => p.id === project.id);
        if (idx !== -1) {
          projects[idx] = updated;
          localStorage.setItem("codemore_projects", JSON.stringify(projects));
        }
      }

      toast.success("Re-analysis complete");
    } catch (error) {
      console.error("Reanalysis failed:", error);
      const message = error instanceof Error ? error.message : "Re-analysis failed";
      toast.error(message);
    }
    setReanalyzing(false);
  };

  // Delete project
  const handleDelete = async () => {
    if (!confirm("Delete this project and its analysis results?")) return;
    // Try deleting from DB
    try {
      await fetch(`/api/projects/${project?.id}`, { method: "DELETE" });
    } catch { /* DB not available */ }
    // Also remove from localStorage
    const saved = localStorage.getItem("codemore_projects");
    if (saved) {
      const projects: Project[] = JSON.parse(saved);
      const filtered = projects.filter((p) => p.id !== project?.id);
      localStorage.setItem("codemore_projects", JSON.stringify(filtered));
    }
    toast.success("Project deleted");
    router.push("/dashboard");
  };

  // Export issues as JSON
  const handleExport = () => {
    const data = JSON.stringify(
      { project: project?.name, issues: filteredIssues, metrics },
      null,
      2
    );
    downloadFile(data, `codemore-${project?.name || "report"}.json`, "application/json");
    toast.success("Report exported as JSON");
  };

  // Export as SARIF
  const handleSarifExport = () => {
    const sarif = generateSarif(project?.name || "project", filteredIssues);
    const data = JSON.stringify(sarif, null, 2);
    downloadFile(data, `codemore-${project?.name || "report"}.sarif`, "application/json");
    toast.success("SARIF report exported");
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const toggleSeverity = (s: Severity) => {
    const next = new Set(selectedSeverities);
    if (next.has(s)) { next.delete(s); } else { next.add(s); }
    setSelectedSeverities(next);
  };

  const toggleCategory = (c: IssueCategory) => {
    const next = new Set(selectedCategories);
    if (next.has(c)) { next.delete(c); } else { next.add(c); }
    setSelectedCategories(next);
  };

  const toggleFile = (path: string) => {
    const next = new Set(expandedFiles);
    if (next.has(path)) { next.delete(path); } else { next.add(path); }
    setExpandedFiles(next);
  };

  const formatDebt = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 480) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 480)}d`;
  };

  if (!project) {
    if (notFound) {
      router.push("/dashboard");
      return null;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      <Navbar />

      <ErrorBoundary>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Back + Project Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="mb-4 flex items-center gap-1.5 text-sm text-surface-400 transition hover:text-white"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {project.source === "github" ? (
                <Github size={24} className="text-surface-400" />
              ) : (
                <Upload size={24} className="text-surface-400" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {project.name}
                </h1>
                {project.repoFullName && (
                  <p className="text-sm text-surface-400">
                    {project.repoFullName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-300 transition hover:border-surface-500 hover:text-white disabled:opacity-50"
              >
                {reanalyzing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Re-analyze
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-300 transition hover:border-surface-500 hover:text-white"
                title="Export as JSON"
              >
                <Download size={14} /> JSON
              </button>
              <button
                onClick={handleSarifExport}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-300 transition hover:border-surface-500 hover:text-white"
                title="Export as SARIF (GitHub Security compatible)"
              >
                <FileJson size={14} /> SARIF
              </button>
              <button
                onClick={() => setShowBadgeModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-300 transition hover:border-surface-500 hover:text-white"
                title="Get embeddable badge"
              >
                <Copy size={14} /> Badge
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-900/50 px-3 py-2 text-sm text-red-400 transition hover:border-red-700 hover:bg-red-950/30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {project.analyzedAt && (
            <p className="mt-2 text-xs text-surface-500">
              Last analyzed: {new Date(project.analyzedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl bg-surface-900 p-1">
          {(
            [
              { id: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
              {
                id: "issues",
                label: `Issues (${issues.length})`,
                icon: <Bug size={14} />,
              },
              {
                id: "files",
                label: `Files (${project.files?.length || 0})`,
                icon: <FolderTree size={14} />,
              },
              {
                id: "history",
                label: `History (${scanHistory.length})`,
                icon: <History size={14} />,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-surface-800 text-white shadow"
                  : "text-surface-400 hover:text-surface-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ============================================================ */}
        {/* OVERVIEW TAB */}
        {/* ============================================================ */}
        {activeTab === "overview" && metrics && (
          <div className="space-y-6 animate-slide-in">
            {/* Score + Stats */}
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              {/* Health Score */}
              <div className="flex items-center justify-center rounded-2xl border border-surface-800 bg-surface-900/50 p-8">
                <HealthScore score={metrics.overallScore} size="lg" />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: <FileText size={20} />,
                    value: metrics.filesAnalyzed,
                    label: "Files Analyzed",
                  },
                  {
                    icon: <Code2 size={20} />,
                    value: metrics.linesOfCode.toLocaleString(),
                    label: "Lines of Code",
                  },
                  {
                    icon: <Bug size={20} />,
                    value: issues.length,
                    label: "Total Issues",
                  },
                  {
                    icon: <Clock size={20} />,
                    value: formatDebt(metrics.technicalDebtMinutes),
                    label: "Tech Debt",
                  },
                  {
                    icon: <BarChart3 size={20} />,
                    value: metrics.averageComplexity.toFixed(1),
                    label: "Avg Complexity",
                  },
                  {
                    icon: <FolderTree size={20} />,
                    value: Object.keys(fileStats).length,
                    label: "Languages",
                  },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900/50 p-4"
                  >
                    <div className="text-surface-400">{stat.icon}</div>
                    <div>
                      <div className="text-lg font-bold text-white">
                        {stat.value}
                      </div>
                      <div className="text-xs text-surface-500">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Severity Breakdown */}
            <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-surface-400">
                Issues by Severity
              </h3>
              <div className="space-y-3">
                {(
                  Object.entries(metrics.issuesBySeverity) as [
                    Severity,
                    number,
                  ][]
                ).map(([severity, count]) => (
                  <div key={severity} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: severityColors[severity],
                          }}
                        />
                        <span className="text-surface-300">{severity}</span>
                      </div>
                      <span className="font-semibold text-white">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            (count / Math.max(1, issues.length)) * 100
                          )}%`,
                          backgroundColor: severityColors[severity],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category + Language Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Issues by Category */}
              <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-surface-400">
                  Issues by Category
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(
                    Object.entries(metrics.issuesByCategory) as [
                      IssueCategory,
                      number,
                    ][]
                  )
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => (
                      <div
                        key={category}
                        className="flex flex-col items-center rounded-xl bg-surface-800/50 p-3 text-center"
                      >
                        <div className="mb-1 text-surface-400">
                          {categoryIcons[category]}
                        </div>
                        <span className="text-lg font-bold text-white">
                          {count}
                        </span>
                        <span className="text-[10px] capitalize text-surface-500">
                          {category.replace("-", " ")}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Languages */}
              <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-surface-400">
                  Files by Language
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Object.entries(fileStats)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 9)
                    .map(([lang, count]) => (
                      <div
                        key={lang}
                        className="flex flex-col items-center rounded-xl bg-surface-800/50 p-3"
                      >
                        <span className="text-lg font-bold text-white">
                          {count}
                        </span>
                        <span className="text-[10px] text-surface-500">
                          {lang}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Health History Chart */}
            {project?.id && <HealthHistoryChart projectId={project.id} />}

            {/* Top Issues */}
            {issues.length > 0 && (
              <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-surface-400">
                  Top Issues
                </h3>
                <div className="space-y-2">
                  {issues.slice(0, 5).map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => {
                        setSelectedIssue(issue);
                        setActiveTab("issues");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg bg-surface-800/30 p-3 text-left transition hover:bg-surface-800/70"
                    >
                      <SeverityBadge severity={issue.severity} small />
                      <span className="flex-1 truncate text-sm text-surface-200">
                        {issue.title}
                      </span>
                      <span className="text-xs text-surface-500">
                        {issue.location.filePath.split(/[/\\]/).pop()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ISSUES TAB */}
        {/* ============================================================ */}
        {activeTab === "issues" && (
          <div className="space-y-4 animate-slide-in">
            {/* Search + Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-surface-700 bg-surface-900 px-3 py-2">
                <Search size={16} className="text-surface-500" />
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-surface-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")}>
                    <X size={14} className="text-surface-500" />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                  showFilters
                    ? "border-brand-500 bg-brand-500/10 text-brand-400"
                    : "border-surface-700 text-surface-400 hover:text-white"
                }`}
              >
                <Filter size={14} /> Filters
                {(selectedSeverities.size > 0 ||
                  selectedCategories.size > 0) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                )}
              </button>

              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm text-surface-400 transition hover:text-white"
              >
                <Download size={14} /> Export
              </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="rounded-xl border border-surface-700 bg-surface-900 p-4 animate-slide-in">
                <div className="mb-3">
                  <span className="text-xs font-semibold uppercase text-surface-500">
                    Severity
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as Severity[]
                    ).map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleSeverity(s)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          selectedSeverities.has(s)
                            ? "border-transparent text-white"
                            : "border-surface-600 text-surface-300 hover:border-surface-400"
                        }`}
                        style={
                          selectedSeverities.has(s)
                            ? { backgroundColor: severityColors[s] }
                            : {}
                        }
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase text-surface-500">
                    Category
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(categoryIcons) as IssueCategory[]).map(
                      (c) => (
                        <button
                          key={c}
                          onClick={() => toggleCategory(c)}
                          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs capitalize transition ${
                            selectedCategories.has(c)
                              ? "border-brand-500 bg-brand-500/20 text-brand-300"
                              : "border-surface-600 text-surface-300 hover:border-surface-400"
                          }`}
                        >
                          {categoryIcons[c]}
                          {c.replace("-", " ")}
                        </button>
                      )
                    )}
                  </div>
                </div>
                {(selectedSeverities.size > 0 ||
                  selectedCategories.size > 0) && (
                  <button
                    onClick={() => {
                      setSelectedSeverities(new Set());
                      setSelectedCategories(new Set());
                    }}
                    className="mt-3 text-xs text-surface-400 transition hover:text-white"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-surface-500">
              {filteredIssues.length} of {issues.length} issues
            </p>

            {/* Issue List */}
            {filteredIssues.length === 0 ? (
              <div className="rounded-xl border border-surface-800 py-16 text-center">
                <Lightbulb
                  size={48}
                  className="mx-auto mb-3 text-surface-600"
                />
                <p className="text-surface-400">
                  {issues.length === 0
                    ? "No issues found. Your code looks great!"
                    : "No issues match your filters."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`rounded-xl border p-4 transition ${
                      selectedIssue?.id === issue.id
                        ? "border-brand-500/50 bg-brand-500/5"
                        : "border-surface-800 bg-surface-900/50 hover:border-surface-600"
                    }`}
                    onClick={() =>
                      setSelectedIssue(
                        selectedIssue?.id === issue.id ? null : issue
                      )
                    }
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={issue.severity} />
                      <CategoryBadge category={issue.category} />
                    </div>
                    <h4 className="mb-1 font-semibold text-white">
                      {issue.title}
                    </h4>
                    <p className="mb-3 text-sm text-surface-400">
                      {issue.description}
                    </p>

                    <div className="mb-2 flex items-center gap-1 text-xs text-brand-400">
                      <FileText size={12} />
                      <span>
                        {issue.location.filePath}:
                        {issue.location.range.start.line + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-surface-500">
                      <span className="flex items-center gap-1">
                        <Target size={12} /> {issue.confidence}% confidence
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap size={12} /> {issue.impact}% impact
                      </span>
                    </div>

                    {issue.codeSnippet && (
                      <pre className="code-snippet mt-3">
                        <code>{issue.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedIssue && (
              <div
                ref={selectedIssuePanelRef}
                className="mt-6 rounded-xl border border-surface-800 bg-surface-900/60 p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-surface-500">
                      Selected Issue
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      {selectedIssue.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => handleGenerateFix(selectedIssue)}
                    disabled={generatingFixIssueId === selectedIssue.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generatingFixIssueId === selectedIssue.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Generating Fix
                      </>
                    ) : (
                      <>
                        <Lightbulb size={14} />
                        Generate Fix
                      </>
                    )}
                  </button>
                </div>

                <p className="mb-4 text-sm text-surface-400">
                  Generate a focused fix suggestion for this issue using the same AI fix engine family used by the extension.
                </p>

                {/* AI Settings Section */}
                <div className="mb-4 rounded-lg border border-surface-700 bg-surface-800/30">
                  <button
                    onClick={() => setShowAiSettings(!showAiSettings)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Settings size={16} className="text-surface-400" />
                      <span className="text-sm font-medium text-surface-300">
                        AI Settings
                      </span>
                      {aiSettings.apiKey && (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          Configured
                        </span>
                      )}
                    </div>
                    {showAiSettings ? (
                      <ChevronDown size={16} className="text-surface-500" />
                    ) : (
                      <ChevronRight size={16} className="text-surface-500" />
                    )}
                  </button>

                  {showAiSettings && (
                    <div className="border-t border-surface-700 px-4 py-4">
                      <p className="mb-3 text-xs text-surface-500">
                        Configure your LLM provider and API key to generate AI-powered fix suggestions.
                      </p>

                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-surface-400">
                          Provider
                        </label>
                        <select
                          value={aiSettings.aiProvider}
                          onChange={(e) =>
                            setAiSettings({
                              ...aiSettings,
                              aiProvider: e.target.value as AiProvider,
                            })
                          }
                          className="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                        >
                          <option value="openai">OpenAI (GPT-4)</option>
                          <option value="anthropic">Anthropic (Claude)</option>
                          <option value="gemini">Google Gemini</option>
                        </select>
                      </div>

                      <div className="mb-4">
                        <label className="mb-1 block text-xs font-medium text-surface-400">
                          API Key
                        </label>
                        <div className="relative">
                          <Key
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
                          />
                          <input
                            type="password"
                            value={aiSettings.apiKey}
                            onChange={(e) =>
                              setAiSettings({
                                ...aiSettings,
                                apiKey: e.target.value,
                              })
                            }
                            placeholder={`Enter your ${
                              aiSettings.aiProvider === "openai"
                                ? "OpenAI"
                                : aiSettings.aiProvider === "anthropic"
                                ? "Anthropic"
                                : "Gemini"
                            } API key`}
                            className="w-full rounded-lg border border-surface-600 bg-surface-900 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-surface-500 focus:border-brand-500"
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-surface-500">
                          Your API key is stored locally in your browser and sent securely with each request.
                        </p>
                      </div>

                      <button
                        onClick={saveAiSettings}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-brand-400"
                      >
                        Save Settings
                      </button>
                    </div>
                  )}
                </div>

                {selectedIssueSuggestions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-surface-700 px-4 py-6 text-sm text-surface-500">
                    No suggestions generated yet for this issue.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedIssueSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded-lg border border-surface-800 bg-surface-950/60 p-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h4 className="font-medium text-white">{suggestion.title}</h4>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(suggestion.suggestedCode);
                              toast.success("Suggested fix copied");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-surface-700 px-2 py-1 text-xs text-surface-300 transition hover:border-surface-500 hover:text-white"
                          >
                            <Copy size={12} />
                            Copy Fix
                          </button>
                        </div>
                        <p className="mb-3 text-sm text-surface-400">
                          {suggestion.description}
                        </p>
                        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-surface-500">
                          <span>{suggestion.confidence}% confidence</span>
                          <span>{suggestion.impact}% impact</span>
                          <span>{suggestion.tags.join(", ")}</span>
                        </div>
                        <pre className="code-snippet">
                          <code>{suggestion.suggestedCode}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* FILES TAB */}
        {/* ============================================================ */}
        {activeTab === "files" && (
          <div className="space-y-2 animate-slide-in">
            {project.files && project.files.length > 0 ? (
              project.files.map((file) => {
                const fileIssues = issuesByFile.get(file.path) || [];
                const isExpanded = expandedFiles.has(file.path);

                return (
                  <div
                    key={file.path}
                    className="rounded-xl border border-surface-800 bg-surface-900/50"
                  >
                    <button
                      onClick={() => toggleFile(file.path)}
                      className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-surface-800/30"
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-surface-500" />
                      ) : (
                        <ChevronRight size={16} className="text-surface-500" />
                      )}
                      <FileText size={16} className="text-surface-400" />
                      <span className="flex-1 text-sm font-medium text-surface-200">
                        {file.path}
                      </span>
                      <span className="rounded bg-surface-800 px-2 py-0.5 text-xs text-surface-400">
                        {file.language.toUpperCase()}
                      </span>
                      {fileIssues.length > 0 && (
                        <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                          {fileIssues.length} issues
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-surface-800 p-4">
                        <div className="mb-3 flex items-center gap-4 text-xs text-surface-500">
                          <span>
                            {file.content.split("\n").length} lines
                          </span>
                          <span>
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>

                        {fileIssues.length > 0 ? (
                          <div className="space-y-2">
                            {fileIssues.map((issue) => (
                              <div
                                key={issue.id}
                                className="flex items-start gap-2 rounded-lg bg-surface-800/50 p-3"
                              >
                                <SeverityBadge
                                  severity={issue.severity}
                                  small
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-surface-200">
                                    {issue.title}
                                  </p>
                                  <p className="text-xs text-surface-500">
                                    Line{" "}
                                    {issue.location.range.start.line + 1}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-surface-500">
                            No issues found in this file.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-surface-800 py-16 text-center">
                <FolderTree
                  size={48}
                  className="mx-auto mb-3 text-surface-600"
                />
                <p className="text-surface-400">No files available.</p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* HISTORY TAB */}
        {/* ============================================================ */}
        {activeTab === "history" && (
          <div className="space-y-4 animate-slide-in">
            {scanHistory.length === 0 ? (
              <div className="rounded-xl border border-surface-800 py-16 text-center">
                <History size={48} className="mx-auto mb-3 text-surface-600" />
                <p className="text-surface-400">
                  No scan history yet. {!scanHistory.length && "Connect Supabase to track scan history across sessions."}
                </p>
              </div>
            ) : (
              <>
                {/* Score trend mini chart */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/50 p-6">
                  <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-surface-400">
                    Health Score Trend
                  </h3>
                  <div className="flex items-end gap-1" style={{ height: 80 }}>
                    {scanHistory.slice().reverse().map((scan) => {
                      const height = Math.max(4, (scan.overallScore / 100) * 80);
                      const color =
                        scan.overallScore >= 80
                          ? "bg-emerald-400"
                          : scan.overallScore >= 60
                          ? "bg-[#f59e0b]"
                          : "bg-red-400";
                      return (
                        <div
                          key={scan.id}
                          className="group relative flex-1"
                          title={`Score: ${Math.round(scan.overallScore)} — ${new Date(scan.scannedAt).toLocaleDateString()}`}
                        >
                          <div
                            className={`w-full rounded-sm ${color} transition-all hover:opacity-80`}
                            style={{ height }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-surface-600">
                    <span>{scanHistory.length > 0 && new Date(scanHistory[scanHistory.length - 1].scannedAt).toLocaleDateString()}</span>
                    <span>{scanHistory.length > 0 && new Date(scanHistory[0].scannedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Scan list */}
                <div className="space-y-2">
                  {scanHistory.map((scan, i) => {
                    const prev = scanHistory[i + 1];
                    const scoreDiff = prev ? scan.overallScore - prev.overallScore : 0;
                    return (
                      <div
                        key={scan.id}
                        className="flex items-center gap-4 rounded-xl border border-surface-800 bg-surface-900/50 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xl font-bold ${
                              scan.overallScore >= 80
                                ? "text-emerald-400"
                                : scan.overallScore >= 60
                                ? "text-[#f59e0b]"
                                : "text-red-400"
                            }`}
                          >
                            {Math.round(scan.overallScore)}
                          </span>
                          {scoreDiff !== 0 && (
                            <span
                              className={`flex items-center gap-0.5 text-xs font-medium ${
                                scoreDiff > 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {scoreDiff > 0 ? (
                                <TrendingUp size={12} />
                              ) : (
                                <TrendingDown size={12} />
                              )}
                              {scoreDiff > 0 ? "+" : ""}{Math.round(scoreDiff)}
                            </span>
                          )}
                          {scoreDiff === 0 && prev && (
                            <span className="flex items-center gap-0.5 text-xs text-surface-500">
                              <Minus size={12} /> 0
                            </span>
                          )}
                        </div>

                        <div className="h-8 w-px bg-surface-700" />

                        <div className="flex flex-1 items-center gap-4 text-xs text-surface-500">
                          <span className="flex items-center gap-1">
                            <Bug size={11} /> {scan.issueCount} issues
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText size={11} /> {scan.filesAnalyzed} files
                          </span>
                          <span className="flex items-center gap-1">
                            <Code2 size={11} /> {scan.linesOfCode.toLocaleString()} LOC
                          </span>
                        </div>

                        <span className="text-xs text-surface-600">
                          {new Date(scan.scannedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </ErrorBoundary>

      {/* Badge Modal */}
      {showBadgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-surface-700 bg-surface-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Embed Badge</h2>
              <button
                onClick={() => setShowBadgeModal(false)}
                className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-800"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 text-sm text-surface-400">
              Add this badge to your README to show your project&apos;s health score.
            </p>

            {/* Preview */}
            <div className="mb-4 flex justify-center rounded-lg bg-surface-800 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/badge/${project.id}`}
                alt="CodeMore badge"
                className="h-5"
              />
            </div>

            {/* Markdown */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-surface-500">
                Markdown
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-surface-800 px-3 py-2 text-xs text-surface-300">
                  {`[![CodeMore](${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${project.id})](${typeof window !== "undefined" ? window.location.origin : ""}/project/${project.id})`}
                </code>
                <button
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    navigator.clipboard.writeText(
                      `[![CodeMore](${origin}/api/badge/${project.id})](${origin}/project/${project.id})`
                    );
                    toast.success("Copied to clipboard");
                  }}
                  className="rounded-lg bg-surface-800 p-2 text-surface-400 transition hover:bg-surface-700 hover:text-white"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            {/* HTML */}
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-500">
                HTML
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-surface-800 px-3 py-2 text-xs text-surface-300">
                  {`<img src="${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${project.id}" alt="CodeMore Score" />`}
                </code>
                <button
                  onClick={() => {
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    navigator.clipboard.writeText(
                      `<img src="${origin}/api/badge/${project.id}" alt="CodeMore Score" />`
                    );
                    toast.success("Copied to clipboard");
                  }}
                  className="rounded-lg bg-surface-800 p-2 text-surface-400 transition hover:bg-surface-700 hover:text-white"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
