import { supabase, isDbEnabled } from "./supabase";
import { CodeIssue, CodeHealthMetrics, Project, Severity, IssueCategory, ProjectFile, ScanJob, CodeSuggestion } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface DbProject {
  id: string;
  user_email: string;
  name: string;
  source: "upload" | "github";
  repo_full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbScan {
  id: string;
  project_id: string;
  overall_score: number;
  files_analyzed: number;
  total_files: number;
  lines_of_code: number;
  avg_complexity: number;
  tech_debt_minutes: number;
  issues_by_severity: Record<string, number>;
  issues_by_category: Record<string, number>;
  issue_count: number;
  scanned_at: string;
}

export interface DbIssue {
  id: string;
  scan_id: string;
  project_id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  file_path: string;
  line_start: number;
  line_end: number;
  col_start: number;
  col_end: number;
  code_snippet: string;
  confidence: number;
  impact: number;
}

export interface DbProjectFile {
  id: string;
  project_id: string;
  path: string;
  content: string;
  language: string;
  size: number;
  created_at: string;
}

export interface DbScanJob {
  id: string;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed";
  source_type: "upload" | "github";
  source_label: string;
  files_discovered: number;
  files_analyzed: number;
  issue_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DbSuggestion {
  id: string;
  issue_id: string;
  project_id: string;
  title: string;
  description: string;
  original_code: string;
  suggested_code: string;
  diff: string;
  location: unknown;
  confidence: number;
  impact: number;
  tags: unknown;
  created_at: string;
}

function normalizeSeverity(severity: string): Severity {
  const value = severity.toUpperCase();
  if (value === "BLOCKER" || value === "CRITICAL" || value === "MAJOR" || value === "MINOR" || value === "INFO") {
    return value;
  }
  return "INFO";
}

function normalizeCategory(category: string): IssueCategory {
  switch (category) {
    case "bug":
    case "code-smell":
    case "performance":
    case "security":
    case "maintainability":
    case "accessibility":
    case "best-practice":
      return category;
    default:
      return "code-smell";
  }
}

export function mapDbIssue(issue: DbIssue): CodeIssue {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    category: normalizeCategory(issue.category),
    severity: normalizeSeverity(issue.severity),
    location: {
      filePath: issue.file_path,
      range: {
        start: { line: issue.line_start, column: issue.col_start },
        end: { line: issue.line_end, column: issue.col_end },
      },
    },
    codeSnippet: issue.code_snippet || "",
    confidence: issue.confidence,
    impact: issue.impact,
    createdAt: Date.parse((issue as DbIssue & { created_at?: string }).created_at || new Date().toISOString()),
  };
}

export function mapDbScanMetrics(scan: DbScan): CodeHealthMetrics {
  return {
    overallScore: Number(scan.overall_score || 0),
    issuesByCategory: {
      bug: Number(scan.issues_by_category?.bug || 0),
      "code-smell": Number(scan.issues_by_category?.["code-smell"] || 0),
      performance: Number(scan.issues_by_category?.performance || 0),
      security: Number(scan.issues_by_category?.security || 0),
      maintainability: Number(scan.issues_by_category?.maintainability || 0),
      accessibility: Number(scan.issues_by_category?.accessibility || 0),
      "best-practice": Number(scan.issues_by_category?.["best-practice"] || 0),
    },
    issuesBySeverity: {
      BLOCKER: Number(scan.issues_by_severity?.BLOCKER || 0),
      CRITICAL: Number(scan.issues_by_severity?.CRITICAL || 0),
      MAJOR: Number(scan.issues_by_severity?.MAJOR || 0),
      MINOR: Number(scan.issues_by_severity?.MINOR || 0),
      INFO: Number(scan.issues_by_severity?.INFO || 0),
    },
    filesAnalyzed: scan.files_analyzed,
    totalFiles: scan.total_files,
    linesOfCode: scan.lines_of_code,
    averageComplexity: Number(scan.avg_complexity || 0),
    technicalDebtMinutes: scan.tech_debt_minutes,
  };
}

export function mapDbScanJob(job: DbScanJob): ScanJob {
  return {
    id: job.id,
    projectId: job.project_id,
    status: job.status,
    source: job.source_type,
    sourceLabel: job.source_label,
    filesDiscovered: job.files_discovered || 0,
    filesAnalyzed: job.files_analyzed || 0,
    issueCount: job.issue_count || 0,
    errorMessage: job.error_message || undefined,
    createdAt: job.created_at,
    startedAt: job.started_at || undefined,
    completedAt: job.completed_at || undefined,
  };
}

export function mapDbSuggestion(suggestion: DbSuggestion): CodeSuggestion {
  const tags = Array.isArray(suggestion.tags)
    ? suggestion.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id: suggestion.id,
    issueId: suggestion.issue_id,
    title: suggestion.title,
    description: suggestion.description,
    originalCode: suggestion.original_code || "",
    suggestedCode: suggestion.suggested_code || "",
    diff: suggestion.diff || "",
    location: (suggestion.location || {
      filePath: "",
      range: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 },
      },
    }) as CodeSuggestion["location"],
    confidence: suggestion.confidence || 0,
    impact: suggestion.impact || 0,
    tags,
  };
}

async function buildProjectSnapshot(dbProject: DbProject, includeFiles: boolean = false): Promise<Project> {
  const latestScan = await getLatestScan(dbProject.id);
  const issues = latestScan ? (await getScanIssues(latestScan.id)).map(mapDbIssue) : [];
  const files = includeFiles ? await getProjectFiles(dbProject.id) : [];

  return {
    id: dbProject.id,
    name: dbProject.name,
    source: dbProject.source,
    repoFullName: dbProject.repo_full_name || undefined,
    files,
    analyzedAt: latestScan
      ? Date.parse(latestScan.scanned_at)
      : Date.parse(dbProject.updated_at || dbProject.created_at),
    metrics: latestScan ? mapDbScanMetrics(latestScan) : undefined,
    issues,
  };
}

// ============================================================================
// Project Operations
// ============================================================================

export async function createProject(
  userEmail: string,
  name: string,
  source: "upload" | "github",
  repoFullName?: string
): Promise<DbProject | null> {
  if (!isDbEnabled()) return null;

  // Check if project already exists for this user + repo
  if (source === "github" && repoFullName) {
    const { data: existing } = await supabase!
      .from("projects")
      .select("*")
      .eq("user_email", userEmail)
      .eq("repo_full_name", repoFullName)
      .single();

    if (existing) {
      // Update timestamp
      await supabase!
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return existing as DbProject;
    }
  }

  const { data, error } = await supabase!
    .from("projects")
    .insert({
      user_email: userEmail,
      name,
      source,
      repo_full_name: repoFullName || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create project:", error);
    return null;
  }
  return data as DbProject;
}

export async function getUserProjects(userEmail: string): Promise<DbProject[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("projects")
    .select("*")
    .eq("user_email", userEmail)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch projects:", error);
    return [];
  }
  return (data || []) as DbProject[];
}

export async function getUserProjectSnapshots(userEmail: string): Promise<Project[]> {
  const projects = await getUserProjects(userEmail);
  return Promise.all(projects.map((project) => buildProjectSnapshot(project)));
}

export async function getProject(
  projectId: string,
  userEmail: string
): Promise<DbProject | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_email", userEmail)
    .single();

  if (error) return null;
  return data as DbProject;
}

export async function getProjectById(projectId: string): Promise<DbProject | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) return null;
  return data as DbProject;
}

export async function getProjectSnapshot(
  projectId: string,
  userEmail: string,
  includeFiles: boolean = false
): Promise<Project | null> {
  const project = await getProject(projectId, userEmail);
  if (!project) {
    return null;
  }

  return buildProjectSnapshot(project, includeFiles);
}

export async function deleteProject(projectId: string, userEmail: string): Promise<boolean> {
  if (!isDbEnabled()) return false;

  const { error } = await supabase!
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_email", userEmail);

  return !error;
}

// ============================================================================
// Scan Operations
// ============================================================================

export async function saveScan(
  projectId: string,
  metrics: CodeHealthMetrics,
  issues: CodeIssue[]
): Promise<DbScan | null> {
  if (!isDbEnabled()) return null;

  // 1. Insert scan record
  const { data: scan, error: scanError } = await supabase!
    .from("scans")
    .insert({
      project_id: projectId,
      overall_score: metrics.overallScore,
      files_analyzed: metrics.filesAnalyzed,
      total_files: metrics.totalFiles,
      lines_of_code: metrics.linesOfCode,
      avg_complexity: metrics.averageComplexity,
      tech_debt_minutes: metrics.technicalDebtMinutes,
      issues_by_severity: metrics.issuesBySeverity,
      issues_by_category: metrics.issuesByCategory,
      issue_count: issues.length,
    })
    .select()
    .single();

  if (scanError || !scan) {
    console.error("Failed to save scan:", scanError);
    return null;
  }

  // 2. Insert issues in batches of 100
  if (issues.length > 0) {
    const issueRows = issues.map((issue) => ({
      scan_id: scan.id,
      project_id: projectId,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      severity: issue.severity,
      file_path: issue.location.filePath,
      line_start: issue.location.range.start.line,
      line_end: issue.location.range.end.line,
      col_start: issue.location.range.start.column,
      col_end: issue.location.range.end.column,
      code_snippet: issue.codeSnippet || "",
      confidence: issue.confidence,
      impact: issue.impact,
    }));

    for (let i = 0; i < issueRows.length; i += 100) {
      const batch = issueRows.slice(i, i + 100);
      const { error } = await supabase!.from("issues").insert(batch);
      if (error) console.error("Failed to save issues batch:", error);
    }
  }

  // 3. Update project timestamp
  await supabase!
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", projectId);

  return scan as DbScan;
}

export async function saveProjectFiles(
  projectId: string,
  files: ProjectFile[]
): Promise<boolean> {
  if (!isDbEnabled()) return false;

  const { error: deleteError } = await supabase!
    .from("project_files")
    .delete()
    .eq("project_id", projectId);

  if (deleteError) {
    console.error("Failed to clear existing project files:", deleteError);
    return false;
  }

  if (files.length === 0) {
    return true;
  }

  const rows = files.map((file) => ({
    project_id: projectId,
    path: file.path,
    content: file.content,
    language: file.language,
    size: file.size,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase!.from("project_files").insert(batch);
    if (error) {
      console.error("Failed to save project files batch:", error);
      return false;
    }
  }

  return true;
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("path", { ascending: true });

  if (error) {
    console.error("Failed to fetch project files:", error);
    return [];
  }

  return ((data || []) as DbProjectFile[]).map((file) => ({
    path: file.path,
    content: file.content,
    language: file.language,
    size: file.size,
  }));
}

export async function getProjectScans(projectId: string): Promise<DbScan[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("scans")
    .select("*")
    .eq("project_id", projectId)
    .order("scanned_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Failed to fetch scans:", error);
    return [];
  }
  return (data || []) as DbScan[];
}

export async function getLatestScan(projectId: string): Promise<DbScan | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("scans")
    .select("*")
    .eq("project_id", projectId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as DbScan;
}

export async function createScanJob(
  projectId: string,
  sourceType: "upload" | "github",
  sourceLabel: string
): Promise<DbScanJob | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("scan_jobs")
    .insert({
      project_id: projectId,
      status: "queued",
      source_type: sourceType,
      source_label: sourceLabel,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create scan job:", error);
    return null;
  }

  return data as DbScanJob;
}

export async function updateScanJob(
  jobId: string,
  updates: Partial<Pick<DbScanJob, "status" | "files_discovered" | "files_analyzed" | "issue_count" | "error_message" | "started_at" | "completed_at">>
): Promise<DbScanJob | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("scan_jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update scan job:", error);
    return null;
  }

  return data as DbScanJob;
}

export async function claimNextQueuedScanJob(): Promise<DbScanJob | null> {
  if (!isDbEnabled()) return null;

  const { data: queuedJob, error: selectError } = await supabase!
    .from("scan_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError || !queuedJob) {
    return null;
  }

  const { data, error } = await supabase!
    .from("scan_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    })
    .eq("id", queuedJob.id)
    .eq("status", "queued")
    .select()
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DbScanJob;
}

export async function resetStaleRunningScanJobs(staleBeforeIso: string): Promise<void> {
  if (!isDbEnabled()) return;

  const { error } = await supabase!
    .from("scan_jobs")
    .update({
      status: "queued",
      started_at: null,
      error_message: "Recovered after worker restart",
    })
    .eq("status", "running")
    .lt("started_at", staleBeforeIso);

  if (error) {
    console.error("Failed to reset stale running scan jobs:", error);
  }
}

export async function getScanJob(jobId: string, userEmail: string): Promise<DbScanJob | null> {
  if (!isDbEnabled()) return null;

  const { data, error } = await supabase!
    .from("scan_jobs")
    .select("*, projects!inner(user_email)")
    .eq("id", jobId)
    .eq("projects.user_email", userEmail)
    .single();

  if (error) {
    return null;
  }

  return data as unknown as DbScanJob;
}

export async function getScanIssues(scanId: string): Promise<DbIssue[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("issues")
    .select("*")
    .eq("scan_id", scanId)
    .order("severity", { ascending: true });

  if (error) {
    console.error("Failed to fetch issues:", error);
    return [];
  }
  return (data || []) as DbIssue[];
}

export async function getSuggestionsForIssue(issueId: string): Promise<CodeSuggestion[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("suggestions")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch suggestions:", error);
    return [];
  }

  return ((data || []) as DbSuggestion[]).map(mapDbSuggestion);
}

export async function saveSuggestionsForIssue(
  projectId: string,
  issueId: string,
  suggestions: CodeSuggestion[]
): Promise<boolean> {
  if (!isDbEnabled()) return false;

  const { error: deleteError } = await supabase!
    .from("suggestions")
    .delete()
    .eq("issue_id", issueId);

  if (deleteError) {
    console.error("Failed to clear existing suggestions:", deleteError);
    return false;
  }

  if (suggestions.length === 0) {
    return true;
  }

  const rows = suggestions.map((suggestion) => ({
    issue_id: issueId,
    project_id: projectId,
    title: suggestion.title,
    description: suggestion.description,
    original_code: suggestion.originalCode || "",
    suggested_code: suggestion.suggestedCode || "",
    diff: suggestion.diff || "",
    location: suggestion.location,
    confidence: suggestion.confidence,
    impact: suggestion.impact,
    tags: suggestion.tags,
  }));

  const { error } = await supabase!.from("suggestions").insert(rows);
  if (error) {
    console.error("Failed to save suggestions:", error);
    return false;
  }

  return true;
}

// ============================================================================
// Stats / Dashboard
// ============================================================================

export async function getUserStats(userEmail: string): Promise<{
  totalProjects: number;
  totalScans: number;
  totalIssuesFound: number;
  avgScore: number;
} | null> {
  if (!isDbEnabled()) return null;

  const { data: projects } = await supabase!
    .from("projects")
    .select("id")
    .eq("user_email", userEmail);

  if (!projects || projects.length === 0) {
    return { totalProjects: 0, totalScans: 0, totalIssuesFound: 0, avgScore: 0 };
  }

  const projectIds = projects.map((p) => p.id);

  const { data: scans } = await supabase!
    .from("scans")
    .select("overall_score, issue_count")
    .in("project_id", projectIds);

  const totalScans = scans?.length || 0;
  const totalIssuesFound = scans?.reduce((acc, s) => acc + (s.issue_count || 0), 0) || 0;
  const avgScore = totalScans > 0
    ? scans!.reduce((acc, s) => acc + (s.overall_score || 0), 0) / totalScans
    : 0;

  return {
    totalProjects: projects.length,
    totalScans,
    totalIssuesFound,
    avgScore: Math.round(avgScore),
  };
}
