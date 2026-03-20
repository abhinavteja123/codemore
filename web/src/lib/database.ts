import { supabase, isDbEnabled } from "./supabase";
import { CodeIssue, CodeHealthMetrics } from "./types";

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
