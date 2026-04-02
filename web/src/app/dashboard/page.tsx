"use client";

import { useSession, signIn } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
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
          {/* ── Greeting ── */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">
              Hey, {session.user?.name?.split(" ")[0] || "there"}
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Upload code or pick a repo to scan.
            </p>
          </div>

          {/* ── User Stats ── */}
          {userStats && (
            <div className="mb-8 grid grid-cols-3 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900/40 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f59e0b]/10">
                  <FolderKanban size={18} className="text-[#f59e0b]" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {userStats.totalProjects}
                  </p>
                  <p className="text-xs text-surface-500">Projects</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900/40 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#06b6d4]/10">
                  <BarChart3 size={18} className="text-[#06b6d4]" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">
                    {userStats.totalScans}
                  </p>
                  <p className="text-xs text-surface-500">Total Scans</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-surface-800 bg-surface-900/40 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <TrendingUp size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p
                    className={`text-lg font-bold ${getScoreColor(userStats.avgScore)}`}
                  >
                    {Math.round(userStats.avgScore)}
                  </p>
                  <p className="text-xs text-surface-500">Avg Score</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Upload Zone ── */}
          <div
            className={`group relative mb-10 overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
              dragActive
                ? "border-[#f59e0b] bg-[#f59e0b]/5"
                : "border-surface-700 hover:border-surface-500"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {/* Glow accent */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-[#f59e0b]/5 blur-3xl transition-opacity group-hover:opacity-100 opacity-0" />

            <div className="relative flex flex-col items-center px-6 py-12 sm:flex-row sm:justify-between sm:px-10">
              <div className="mb-6 flex flex-col items-center text-center sm:mb-0 sm:items-start sm:text-left">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#f59e0b]/10">
                  <FolderArchive size={24} className="text-[#f59e0b]" />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  Drop files or a .zip here
                </h2>
                <p className="mt-1 max-w-sm text-sm text-surface-400">
                  Drag source files, folders, or a ZIP archive. We support
                  TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, and
                  more.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3">
                {analyzing === "upload" ? (
                  <div className="flex items-center gap-3 text-[#f59e0b]">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm font-medium">
                      {uploadProgress}
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-[#f59e0b] px-5 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-[#fbbf24]"
                    >
                      Choose Files
                    </button>
                    <span className="text-xs text-surface-500">
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
            <div className="mb-10">
              <div className="mb-4 flex items-center gap-2">
                <Clock size={16} className="text-surface-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400">
                  Recent Scans
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="group flex flex-col rounded-xl border border-surface-800 bg-surface-900/40 p-4 text-left transition hover:border-surface-600 hover:bg-surface-900/70"
                  >
                    {/* Top row */}
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {project.source === "github" ? (
                          <Github size={14} className="text-[#06b6d4]" />
                        ) : (
                          <Upload size={14} className="text-[#f59e0b]" />
                        )}
                        <span className="text-sm font-semibold text-white">
                          {project.name}
                        </span>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-surface-600 transition group-hover:text-white"
                      />
                    </div>

                    {/* Metrics strip */}
                    {project.metrics && (
                      <div className="flex items-center gap-3">
                        {/* Score dot */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-2 w-2 rounded-full ${getScoreDot(project.metrics.overallScore)}`}
                          />
                          <span
                            className={`text-sm font-bold ${getScoreColor(project.metrics.overallScore)}`}
                          >
                            {Math.round(project.metrics.overallScore)}
                          </span>
                        </div>

                        <span className="h-3 w-px bg-surface-700" />

                        {/* Issue count */}
                        <span className="flex items-center gap-1 text-xs text-surface-500">
                          <Bug size={11} />
                          {project.issues?.length || 0}
                        </span>

                        {/* File count */}
                        <span className="flex items-center gap-1 text-xs text-surface-500">
                          <FileText size={11} />
                          {project.metrics.filesAnalyzed}
                        </span>
                      </div>
                    )}

                    {/* Timestamp */}
                    {project.analyzedAt && (
                      <p className="mt-2 text-[11px] text-surface-600">
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
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── GitHub Repos ── */}
          {isGitHub ? (
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Github size={16} className="text-[#06b6d4]" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400">
                    Your Repositories
                  </h2>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/60 px-3 py-1.5">
                  <Search size={14} className="text-surface-500" />
                  <input
                    type="text"
                    placeholder="Filter repos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-44 bg-transparent text-sm text-white outline-none placeholder:text-surface-600"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")}>
                      <X size={12} className="text-surface-500" />
                    </button>
                  )}
                </div>
              </div>

              {loadingRepos ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2
                    size={20}
                    className="animate-spin text-[#06b6d4]"
                  />
                  <span className="ml-3 text-sm text-surface-500">
                    Loading...
                  </span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="rounded-xl border border-surface-800 py-16 text-center">
                  <FolderOpen
                    size={40}
                    className="mx-auto mb-3 text-surface-700"
                  />
                  <p className="text-sm text-surface-500">
                    {searchQuery
                      ? "No repos match."
                      : "No repositories found."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className="group rounded-xl border border-surface-800 bg-surface-900/30 p-4 transition hover:border-surface-600"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {repo.name}
                          </h3>
                          {repo.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-surface-500">
                              {repo.description}
                            </p>
                          )}
                        </div>
                        {repo.private ? (
                          <Lock
                            size={12}
                            className="ml-2 mt-1 text-surface-600"
                          />
                        ) : (
                          <Globe
                            size={12}
                            className="ml-2 mt-1 text-surface-600"
                          />
                        )}
                      </div>

                      <div className="mb-3 flex items-center gap-3 text-xs text-surface-600">
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#06b6d4]" />
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
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#06b6d4]/10 py-2 text-xs font-medium text-[#06b6d4] transition hover:bg-[#06b6d4]/20 disabled:opacity-40"
                      >
                        {analyzing === repo.full_name ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <Zap size={12} />
                            Scan
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Non-GitHub user: show GitHub connect prompt */
            <div className="rounded-2xl border border-surface-800 bg-surface-900/30 p-8 text-center">
              <Github size={32} className="mx-auto mb-3 text-surface-600" />
              <h3 className="text-lg font-semibold text-white">
                Want to scan a GitHub repo?
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-surface-500">
                Connect your GitHub account to browse and analyze your
                repositories directly. Your current session is via{" "}
                {session?.provider || "email"}.
              </p>
              <button
                onClick={() => signIn("github")}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#06b6d4] px-5 py-2.5 text-sm font-semibold text-surface-950 transition hover:bg-[#22d3ee]"
              >
                <Github size={16} />
                Connect GitHub
              </button>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
}
