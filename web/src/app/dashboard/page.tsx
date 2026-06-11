/* codemore-ignore-file: core-quality-empty-catch, core-quality-leftover-console, core-typescript-as-any, core-quality-async-without-await, core-bugs-todo-fixme, core-typescript-non-null-assertion-abuse, core-bugs-loose-equality */
/* Web dashboard — Phase 3 plan demotes this to a 'scan-by-URL' demo. The
   page-level empty catches are part of the legacy dashboard slated for
   replacement; rules will re-apply per-component after the rewrite. */

"use client";

import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";
import { waitForScanJobCompletion } from "@/lib/scanJobClient";
import {
  Upload,
  Github,
  FolderOpen,
  Loader2,
  Search,
  Star,
  Lock,
  Globe,
  ArrowRight,
  X,
  FolderArchive,
  Zap,
  Clock,
  Bug,
  FileText,
  BarChart3,
  TrendingUp,
  FolderKanban,
} from "lucide-react";
import { GitHubRepo, Project, ProjectFile } from "@/lib/types";

const SUPPORTED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "java", "cs", "go", "rs", "rb",
  "php", "cpp", "c", "h", "html", "css", "json", "yaml", "yml",
  "sql", "sh", "swift", "kt", "scala", "lua", "r", "m", "vue",
  "svelte", "astro",
]);

interface UserStats {
  totalProjects: number;
  totalScans: number;
  avgScore: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  const isGitHub = session?.provider === "github";
  const isDemo = status === "unauthenticated";

  // Don't force sign-in anymore - allow demo mode
  // useEffect(() => {
  //   if (status === "unauthenticated") {
  //     signIn();
  //   }
  // }, [status]);

  // Load projects: try DB first, fall back to localStorage
  useEffect(() => {
    async function loadProjects() {
      // In demo mode, only use localStorage
      if (isDemo) {
        const saved = localStorage.getItem("codemore_projects");
        if (saved) {
          try {
            setProjects(JSON.parse(saved));
          } catch {
            /* ignore */
          }
        }
        return;
      }
      
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          if (data.projects?.length > 0) {
            const dbProjects: Project[] = data.projects.map((p: any) => ({
              id: p.id,
              name: p.name,
              source: p.source,
              repoFullName: p.repoFullName || p.repo_full_name,
              files: Array.isArray(p.files) ? p.files : [],
              analyzedAt: typeof p.analyzedAt === "number"
                ? p.analyzedAt
                : p.updated_at
                  ? new Date(p.updated_at).getTime()
                  : p.created_at
                    ? new Date(p.created_at).getTime()
                    : Date.now(),
              metrics: p.metrics || p.latest_metrics,
              issues: p.issues || [],
            }));
            setProjects(dbProjects);
            if (data.stats) {
              setUserStats(data.stats);
            }
            return;
          }
        }
      } catch {
        /* fall through to localStorage */
      }

      // Fallback: localStorage
      const saved = localStorage.getItem("codemore_projects");
      if (saved) {
        try {
          setProjects(JSON.parse(saved));
        } catch {
          /* ignore */
        }
      }
    }

    // Load projects for both authenticated users and demo mode
    if (status !== "loading") loadProjects();
  }, [session, status, isDemo]);

  const saveProjects = useCallback(
    (p: Project[]) => {
      setProjects(p);
      localStorage.setItem("codemore_projects", JSON.stringify(p));
    },
    []
  );

  // Fetch GitHub repos only if signed in with GitHub
  const fetchRepos = useCallback(async () => {
    if (!isGitHub || repos.length > 0) return;
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) {
        const data = await res.json();
        // Check if response is an array (repos list) or an object (error/message)
        if (Array.isArray(data)) {
          setRepos(data);
        } else {
          // Not connected or error - keep repos as empty array
          setRepos([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    }
    setLoadingRepos(false);
  }, [isGitHub, repos.length]);

  useEffect(() => {
    if (session && isGitHub) {
      fetchRepos();
    }
  }, [session, isGitHub, fetchRepos]);

  // ── Analyze GitHub repo ──
  const analyzeRepo = async (repo: GitHubRepo) => {
    setAnalyzing(repo.full_name);
    try {
      const scanRes = await fetch("/api/scan-jobs/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: repo.name,
          repoFullName: repo.full_name,
          branch: repo.default_branch,
        }),
      });
      const payload = await scanRes.json().catch(() => ({}));
      if (!scanRes.ok) {
        throw new Error(payload.error || "Repository scan failed");
      }

      let project = payload.project as Project | null;
      if (!project && payload.job?.id) {
        setUploadProgress("Queued scan. Waiting for analysis to finish...");
        const completed = await waitForScanJobCompletion(payload.job.id);
        project = completed.project;
      }
      if (!project) {
        throw new Error("Completed scan did not return a project snapshot");
      }

      saveProjects([project, ...projects.filter((p) => p.id !== project.id)]);
      toast.success(`Scan complete for ${repo.name}`);
      router.push(`/project/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed. Please try again.");
    }
    setAnalyzing(null);
  };

  // ── Handle ZIP upload ──
  const handleZipUpload = async (file: File) => {
    setAnalyzing("upload");
    setUploadProgress("Uploading ZIP to server...");

    try {
      const projectName =
        file.name.replace(/\.zip$/i, "") || "Uploaded Project";

      setUploadProgress("Server is extracting and scanning the archive...");

      const formData = new FormData();
      formData.append("archive", file);
      formData.append("name", projectName);

      const res = await fetch("/api/scan-jobs/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to process ZIP file");
      }

      let project = payload.project as Project | null;
      if (!project && payload.job?.id) {
        setUploadProgress("Queued scan. Waiting for analysis to finish...");
        const completed = await waitForScanJobCompletion(payload.job.id);
        project = completed.project;
      }
      if (!project) {
        throw new Error("Completed scan did not return a project snapshot");
      }

      saveProjects([project, ...projects]);
      toast.success(`Scan complete: ${project.metrics?.filesAnalyzed || project.files.length} files analyzed`);
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error("ZIP upload error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to process ZIP file. Please try again.");
    }
    setAnalyzing(null);
    setUploadProgress(null);
  };

  // ── Handle file upload (individual files) ──
  const handleFileUpload = async (fileList: FileList) => {
    const firstFile = fileList[0];

    // Check if it's a ZIP
    if (fileList.length === 1 && firstFile?.name.endsWith(".zip")) {
      handleZipUpload(firstFile);
      return;
    }

    const files: ProjectFile[] = [];
    setAnalyzing("upload");
    setUploadProgress("Reading files...");

    for (const file of Array.from(fileList)) {
      if (file.size > 500000) continue;
      try {
        const content = await file.text();
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
        // webkitRelativePath is non-standard but supported in most browsers
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        files.push({
          path: relativePath,
          content,
          language: ext,
          size: file.size,
        });
      } catch {
        /* skip unreadable files */
      }
    }

    if (files.length === 0) {
      toast.error("No supported source files found.");
      setAnalyzing(null);
      setUploadProgress(null);
      return;
    }

    setUploadProgress(`Analyzing ${files.length} files...`);
    try {
      const projectName = files[0].path.split("/")[0] || "Uploaded Project";
      const res = await fetch("/api/scan-jobs/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          source: "upload",
          files,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Analysis failed");
      }

      let project = payload.project as Project | null;
      if (!project && payload.job?.id) {
        setUploadProgress("Queued scan. Waiting for analysis to finish...");
        const completed = await waitForScanJobCompletion(payload.job.id);
        project = completed.project;
      }
      if (!project) {
        throw new Error("Completed scan did not return a project snapshot");
      }

      saveProjects([project, ...projects]);
      toast.success(`Scan complete: ${project.metrics?.filesAnalyzed || files.length} files analyzed`);
      router.push(`/project/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed. Please try again.");
    }
    setAnalyzing(null);
    setUploadProgress(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-[#f59e0b]";
    return "text-red-400";
  };

  const getScoreDot = (score: number) => {
    if (score >= 80) return "bg-emerald-400";
    if (score >= 60) return "bg-[#f59e0b]";
    return "bg-red-400";
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f59e0b] border-t-transparent" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-screen bg-surface-950">
      <Navbar />

      <ErrorBoundary>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Subtle background grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none z-0" />

          {/* ── Greeting ── */}
          <div className="mb-8 relative z-10">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Hey, {session.user?.name?.split(" ")[0] || "there"}
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Select a repository or upload source files to start scanning.
            </p>
          </div>

          {/* ── User Stats ── */}
          {userStats && (
            <div className="mb-8 relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SpotlightCard glow="amber" innerClassName="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                  <FolderKanban size={20} className="text-[#f59e0b]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {userStats.totalProjects}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-surface-500">Projects</p>
                </div>
              </SpotlightCard>
              
              <SpotlightCard glow="brand" innerClassName="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10">
                  <BarChart3 size={20} className="text-brand-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tracking-tight">
                    {userStats.totalScans}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-surface-500">Total Scans</p>
                </div>
              </SpotlightCard>

              <SpotlightCard glow="teal" innerClassName="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10">
                  <TrendingUp size={20} className="text-teal-400" />
                </div>
                <div>
                  <p className={`text-2xl font-bold tracking-tight ${getScoreColor(userStats.avgScore)}`}>
                    {Math.round(userStats.avgScore)}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-surface-500">Avg Score</p>
                </div>
              </SpotlightCard>
            </div>
          )}

          {/* ── Upload Zone ── */}
          <div
            className={`group relative mb-10 overflow-hidden rounded-2xl border border-dashed transition-all duration-300 z-10 ${
              dragActive
                ? "border-brand-500 bg-brand-500/5 shadow-glow-brand-sm"
                : "border-white/[0.08] bg-surface-900/20 hover:border-white/[0.15] hover:bg-surface-900/35"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {/* Glow accent */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-500/5 blur-3xl transition-opacity group-hover:opacity-100 opacity-0" />

            <div className="relative flex flex-col items-center px-6 py-12 sm:flex-row sm:justify-between sm:px-10">
              <div className="mb-6 flex flex-col items-center text-center sm:mb-0 sm:items-start sm:text-left">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/20">
                  <FolderArchive size={24} className="text-[#f59e0b]" />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Drop files or a .zip here
                </h2>
                <p className="mt-1.5 max-w-sm text-xs text-surface-450 leading-relaxed">
                  Drag source files, folders, or a ZIP archive. We support
                  TypeScript, JavaScript, Python, Go, Rust, Java, SQL, and more.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3">
                {analyzing === "upload" ? (
                  <div className="flex items-center gap-3 text-[#f59e0b] bg-[#f59e0b]/10 px-4 py-2.5 rounded-lg border border-[#f59e0b]/20">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs font-mono font-medium">
                      {uploadProgress}
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-white text-surface-950 hover:bg-white/90 px-5 py-2.5 text-sm font-semibold tracking-tight transition active:scale-[0.98]"
                    >
                      Choose Files
                    </button>
                    <span className="text-xs text-surface-500 font-mono">
                      or drag & drop anywhere
                    </span>
                  </>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".ts,.tsx,.js,.jsx,.py,.java,.cs,.go,.rs,.rb,.php,.cpp,.c,.h,.html,.css,.json,.yaml,.yml,.sql,.sh,.zip"
              onChange={(e) => {
                if (e.target.files) handleFileUpload(e.target.files);
              }}
            />
          </div>

          {/* ── Recent Projects ── */}
          {projects.length > 0 && (
            <div className="mb-10 relative z-10">
              <div className="mb-4 flex items-center gap-2">
                <Clock size={15} className="text-surface-500" />
                <h2 className="text-xs font-semibold font-mono uppercase tracking-wider text-surface-400">
                  Recent Scans
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="group text-left block h-full focus:outline-none"
                  >
                    <SpotlightCard
                      glow={project.source === "github" ? "brand" : "amber"}
                      innerClassName="p-5 flex flex-col justify-between h-full"
                      className="h-full"
                    >
                      {/* Top row */}
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {project.source === "github" ? (
                            <Github size={15} className="text-brand-400 shrink-0" />
                          ) : (
                            <Upload size={15} className="text-[#f59e0b] shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                            {project.name}
                          </span>
                        </div>
                        <ArrowRight
                          size={14}
                          className="text-surface-500 transition-all group-hover:translate-x-1 group-hover:text-white shrink-0"
                        />
                      </div>

                      {/* Metrics strip */}
                      {project.metrics && (
                        <div className="flex items-center gap-3">
                          {/* Score dot */}
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${getScoreDot(project.metrics.overallScore)}`}
                            />
                            <span
                              className={`text-xs font-bold ${getScoreColor(project.metrics.overallScore)}`}
                            >
                              {Math.round(project.metrics.overallScore)}
                            </span>
                          </div>

                          <span className="h-3 w-px bg-white/[0.06]" />

                          {/* Issue count */}
                          <span className="flex items-center gap-1 text-[11px] font-mono text-surface-400">
                            <Bug size={11} />
                            {project.issues?.length || 0}
                          </span>

                          <span className="h-3 w-px bg-white/[0.06]" />

                          {/* File count */}
                          <span className="flex items-center gap-1 text-[11px] font-mono text-surface-400">
                            <FileText size={11} />
                            {project.metrics.filesAnalyzed}
                          </span>
                        </div>
                      )}

                      {/* Timestamp */}
                      {project.analyzedAt && (
                        <p className="mt-4 text-[10px] font-mono text-surface-500 border-t border-white/[0.03] pt-2">
                          {new Date(project.analyzedAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      )}
                    </SpotlightCard>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── GitHub Repos ── */}
          {isGitHub ? (
            <div className="relative z-10">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Github size={15} className="text-brand-400" />
                  <h2 className="text-xs font-semibold font-mono uppercase tracking-wider text-surface-400">
                    Your Repositories
                  </h2>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-900/60 px-3 py-1.5">
                  <Search size={14} className="text-surface-500" />
                  <input
                    type="text"
                    placeholder="Filter repos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-44 bg-transparent text-xs text-white outline-none placeholder:text-surface-650"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")}>
                      <X size={12} className="text-surface-500" />
                    </button>
                  )}
                </div>
              </div>

              {loadingRepos ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-32 rounded-xl border border-white/[0.04] bg-surface-900/20 p-5 animate-pulse flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="h-4 w-1/3 bg-white/10 rounded" />
                        <div className="h-3 w-2/3 bg-white/5 rounded" />
                      </div>
                      <div className="h-8 w-full bg-white/5 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-surface-900/10 py-16 text-center">
                  <FolderOpen
                    size={36}
                    className="mx-auto mb-3 text-surface-600"
                  />
                  <p className="text-xs text-surface-500 font-mono">
                    {searchQuery
                      ? "No repos match."
                      : "No repositories found."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRepos.map((repo) => (
                    <SpotlightCard
                      key={repo.id}
                      glow="brand"
                      innerClassName="p-5 flex flex-col justify-between h-full"
                      className="h-full"
                    >
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {repo.name}
                          </h3>
                          {repo.private ? (
                            <Lock
                              size={12}
                              className="text-surface-500 shrink-0 mt-1"
                            />
                          ) : (
                            <Globe
                              size={12}
                              className="text-surface-500 shrink-0 mt-1"
                            />
                          )}
                        </div>
                        {repo.description && (
                          <p className="line-clamp-1 text-xs text-surface-450 leading-relaxed mb-3">
                            {repo.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-auto">
                        <div className="mb-4 flex items-center gap-3 text-[10.5px] font-mono text-surface-500">
                          {repo.language && (
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-brand-450" />
                              {repo.language}
                            </span>
                          )}
                          {repo.stargazers_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Star size={11} />
                              {repo.stargazers_count}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => analyzeRepo(repo)}
                          disabled={!!analyzing}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 py-2 text-xs font-semibold text-brand-300 transition-all hover:bg-brand-500/20 disabled:opacity-40"
                        >
                          {analyzing === repo.full_name ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Zap size={12} />
                              Scan Repo
                            </>
                          )}
                        </button>
                      </div>
                    </SpotlightCard>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Non-GitHub user: show GitHub connect prompt */
            <div className="relative z-10 rounded-2xl border border-white/[0.06] bg-surface-900/10 p-8 text-center max-w-2xl mx-auto mt-6">
              <Github size={32} className="mx-auto mb-3 text-surface-500" />
              <h3 className="text-base font-semibold text-white">
                Connect GitHub to scan repositories
              </h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-surface-450 leading-relaxed">
                Analyze your remote codebases directly without manually copying code. Connect securely in one click.
              </p>
              <button
                onClick={() => signIn("github")}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-surface-950 transition hover:bg-white/90"
              >
                <Github size={14} />
                Connect GitHub
              </button>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
}
