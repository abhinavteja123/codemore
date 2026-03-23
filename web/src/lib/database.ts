import { supabase, supabaseAdmin, isDbEnabled } from "./supabase";
import { CodeIssue, CodeHealthMetrics, Project, Severity, IssueCategory, ProjectFile, ScanJob, CodeSuggestion } from "./types";
import { logger, sanitizeError } from "./logger";

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
    logger.error({ err: sanitizeError(error) }, "Failed to create project");
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
    logger.error({ err: sanitizeError(error) }, "Failed to fetch projects");
    return [];
  }
  return (data || []) as DbProject[];
}

export async function getUserProjectSnapshots(userEmail: string): Promise<Project[]> {
  if (!isDbEnabled()) return [];

  // Single query with nested select to avoid N+1
  const { data: projects, error } = await supabase!
    .from("projects")
    .select(`
      *,
      scans (
        id,
        overall_score,
        files_analyzed,
        total_files,
        lines_of_code,
        avg_complexity,
        tech_debt_minutes,
        issues_by_severity,
        issues_by_category,
        issue_count,
        scanned_at
      )
    `)
    .eq("user_email", userEmail)
    .order("updated_at", { ascending: false });

  if (error || !projects) {
    logger.error({ err: sanitizeError(error) }, "Failed to fetch project snapshots");
    return [];
  }

  return projects.map((project: DbProject & { scans?: DbScan[] }) => {
    const latestScan = project.scans?.[0];
    return {
      id: project.id,
      name: project.name,
      source: project.source,
      repoFullName: project.repo_full_name || undefined,
      files: [],
      analyzedAt: latestScan
        ? Date.parse(latestScan.scanned_at)
        : Date.parse(project.updated_at),
      metrics: latestScan ? {
        overallScore: latestScan.overall_score,
        filesAnalyzed: latestScan.files_analyzed,
        totalFiles: latestScan.total_files,
        linesOfCode: latestScan.lines_of_code,
        avgComplexity: latestScan.avg_complexity,
        techDebtMinutes: latestScan.tech_debt_minutes,
        issuesBySeverity: latestScan.issues_by_severity as Record<string, number>,
        issuesByCategory: latestScan.issues_by_category as Record<string, number>,
        issueCount: latestScan.issue_count,
      } : undefined,
      issues: [],
    };
  });
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
    logger.error({ err: sanitizeError(scanError) }, "Failed to save scan");
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
      if (error) logger.error({ err: sanitizeError(error) }, "Failed to save issues batch");
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
    logger.error({ err: sanitizeError(deleteError) }, "Failed to clear existing project files");
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
      logger.error({ err: sanitizeError(error) }, "Failed to save project files batch");
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
    logger.error({ err: sanitizeError(error) }, "Failed to fetch project files");
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
    logger.error({ err: sanitizeError(error) }, "Failed to fetch scans");
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
    logger.error({ err: sanitizeError(error) }, "Failed to create scan job");
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
    logger.error({ err: sanitizeError(error) }, "Failed to update scan job");
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
    logger.error({ err: sanitizeError(error) }, "Failed to reset stale running scan jobs");
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

export async function getScanIssues(
  scanId: string,
  options: {
    offset?: number;
    limit?: number;
    severity?: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
    filePath?: string;
  } = {}
): Promise<DbIssue[]> {
  if (!isDbEnabled()) return [];

  const { offset = 0, limit = 200, severity, filePath } = options;

  let query = supabase!
    .from("issues")
    .select("*")
    .eq("scan_id", scanId)
    .order("severity", { ascending: true })
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (severity) query = query.eq("severity", severity);
  if (filePath) query = query.eq("file_path", filePath);

  const { data, error } = await query;

  if (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to fetch issues");
    return [];
  }
  return (data || []) as DbIssue[];
}

export async function getScanIssueCount(scanId: string): Promise<number> {
  if (!isDbEnabled()) return 0;

  const { count, error } = await supabase!
    .from("issues")
    .select("*", { count: "exact", head: true })
    .eq("scan_id", scanId);

  if (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to fetch issue count");
    return 0;
  }

  return count ?? 0;
}

export async function getSuggestionsForIssue(issueId: string): Promise<CodeSuggestion[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabase!
    .from("suggestions")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error({ err: sanitizeError(error) }, "Failed to fetch suggestions");
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
    logger.error({ err: sanitizeError(deleteError) }, "Failed to clear existing suggestions");
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
    logger.error({ err: sanitizeError(error) }, "Failed to save suggestions");
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
  const totalIssuesFound = (scans ?? []).reduce((acc, s) => acc + (s.issue_count ?? 0), 0);
  const avgScore = totalScans > 0
    ? (scans ?? []).reduce((acc, s) => acc + (s.overall_score ?? 0), 0) / totalScans
    : 0;

  return {
    totalProjects: projects.length,
    totalScans,
    totalIssuesFound,
    avgScore: Math.round(avgScore),
  };
}

// ============================================================================
// AI Cost Tracking (FIX 6)
// ============================================================================

// Cost per 1K tokens by model — update as pricing changes
const COST_PER_1K: Record<string, { prompt: number; completion: number }> = {
  'gpt-4o':              { prompt: 0.005,    completion: 0.015 },
  'gpt-4o-mini':         { prompt: 0.000150, completion: 0.000600 },
  'gpt-4-turbo':         { prompt: 0.01,     completion: 0.03 },
  'gpt-4':               { prompt: 0.03,     completion: 0.06 },
  'claude-3-5-sonnet':   { prompt: 0.003,    completion: 0.015 },
  'claude-3-haiku':      { prompt: 0.00025,  completion: 0.00125 },
  'claude-3-opus':       { prompt: 0.015,    completion: 0.075 },
  'gemini-1.5-pro':      { prompt: 0.00125,  completion: 0.005 },
  'gemini-1.5-flash':    { prompt: 0.000075, completion: 0.0003 },
};

export function calculateAICost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = COST_PER_1K[model] ?? { prompt: 0.01, completion: 0.03 };
  return (
    (promptTokens / 1000) * rates.prompt +
    (completionTokens / 1000) * rates.completion
  );
}

export async function recordAIUsage(params: {
  userEmail: string;
  projectId?: string;
  scanId?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<void> {
  if (!isDbEnabled()) return;
  const totalTokens = params.promptTokens + params.completionTokens;
  const estimatedCost = calculateAICost(params.model, params.promptTokens, params.completionTokens);

  const { error } = await supabaseAdmin!
    .from('ai_usage')
    .insert({
      user_email: params.userEmail,
      project_id: params.projectId ?? null,
      scan_id: params.scanId ?? null,
      provider: params.provider,
      model: params.model,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
    });

  if (error) {
    logger.error({ err: sanitizeError(error) }, 'Failed to record AI usage');
  }
}

export async function getDailyAICost(
  userEmail: string,
  date: Date
): Promise<{ totalTokens: number; totalCostUsd: number; apiCalls: number }> {
  if (!isDbEnabled()) return { totalTokens: 0, totalCostUsd: 0, apiCalls: 0 };
  const dateStr = date.toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin!
    .from('ai_daily_costs')
    .select('total_tokens, total_cost_usd, api_calls')
    .eq('user_email', userEmail)
    .eq('date', dateStr);

  if (error || !data) return { totalTokens: 0, totalCostUsd: 0, apiCalls: 0 };

  return data.reduce(
    (acc, row) => ({
      totalTokens: acc.totalTokens + (row.total_tokens ?? 0),
      totalCostUsd: acc.totalCostUsd + Number(row.total_cost_usd ?? 0),
      apiCalls: acc.apiCalls + (row.api_calls ?? 0),
    }),
    { totalTokens: 0, totalCostUsd: 0, apiCalls: 0 }
  );
}

export async function getMonthlyAICost(
  userEmail: string,
  year: number,
  month: number
): Promise<{ totalTokens: number; totalCostUsd: number; apiCalls: number }> {
  if (!isDbEnabled()) return { totalTokens: 0, totalCostUsd: 0, apiCalls: 0 };

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin!
    .from('ai_usage')
    .select('total_tokens, estimated_cost_usd')
    .eq('user_email', userEmail)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59Z');

  if (error || !data) return { totalTokens: 0, totalCostUsd: 0, apiCalls: 0 };

  return {
    totalTokens: data.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
    totalCostUsd: data.reduce((sum, r) => sum + Number(r.estimated_cost_usd ?? 0), 0),
    apiCalls: data.length,
  };
}

// ============================================================================
// Health History (FIX 7)
// ============================================================================

export interface HealthSnapshot {
  id: string;
  projectId: string;
  scanId: string;
  healthScore: number;
  blockerCount: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  totalIssues: number;
  filesAnalyzed: number;
  scannedAt: string;
  // Computed:
  trend?: 'improving' | 'worsening' | 'stable';
}

export async function recordHealthSnapshot(
  projectId: string,
  scanId: string,
  issues: Array<{ severity: string }>,
  filesAnalyzed: number,
  healthScore: number
): Promise<void> {
  if (!isDbEnabled()) return;

  const counts = issues.reduce(
    (acc, issue) => {
      const sev = issue.severity.toLowerCase();
      if (sev === 'blocker') acc.blocker++;
      else if (sev === 'critical') acc.critical++;
      else if (sev === 'major') acc.major++;
      else if (sev === 'minor') acc.minor++;
      else acc.info++;
      return acc;
    },
    { blocker: 0, critical: 0, major: 0, minor: 0, info: 0 }
  );

  const { error } = await supabaseAdmin!
    .from('health_history')
    .upsert({
      project_id: projectId,
      scan_id: scanId,
      health_score: healthScore,
      blocker_count: counts.blocker,
      critical_count: counts.critical,
      major_count: counts.major,
      minor_count: counts.minor,
      info_count: counts.info,
      total_issues: issues.length,
      files_analyzed: filesAnalyzed,
    }, { onConflict: 'scan_id' });

  if (error) {
    logger.error({ err: sanitizeError(error), projectId }, 'Failed to record health snapshot');
  }
}

export async function getHealthHistory(
  projectId: string,
  limit: number = 30
): Promise<HealthSnapshot[]> {
  if (!isDbEnabled()) return [];

  const { data, error } = await supabaseAdmin!
    .from('health_history')
    .select('*')
    .eq('project_id', projectId)
    .order('scanned_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const snapshots = data.map(row => ({
    id: row.id,
    projectId: row.project_id,
    scanId: row.scan_id,
    healthScore: row.health_score,
    blockerCount: row.blocker_count,
    criticalCount: row.critical_count,
    majorCount: row.major_count,
    minorCount: row.minor_count,
    infoCount: row.info_count,
    totalIssues: row.total_issues,
    filesAnalyzed: row.files_analyzed,
    scannedAt: row.scanned_at,
  })) as HealthSnapshot[];

  // Calculate trend based on last 5 entries
  for (let i = 0; i < snapshots.length; i++) {
    const current = snapshots[i];
    const previous = snapshots[i + 1];
    if (!previous) { current.trend = 'stable'; continue; }
    const diff = current.healthScore - previous.healthScore;
    current.trend = diff > 2 ? 'improving' : diff < -2 ? 'worsening' : 'stable';
  }

  return snapshots;
}
