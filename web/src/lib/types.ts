export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface FileLocation {
  filePath: string;
  range: Range;
}

export type Severity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";

export type IssueCategory =
  | "bug"
  | "code-smell"
  | "performance"
  | "security"
  | "maintainability"
  | "accessibility"
  | "best-practice";

export interface CodeIssue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: Severity;
  location: FileLocation;
  codeSnippet: string;
  confidence: number;
  impact: number;
  createdAt: number;
}

export interface CodeSuggestion {
  id: string;
  issueId: string;
  title: string;
  description: string;
  originalCode: string;
  suggestedCode: string;
  diff: string;
  location: FileLocation;
  confidence: number;
  impact: number;
  tags: string[];
}

export interface CodeHealthMetrics {
  overallScore: number;
  issuesByCategory: Record<IssueCategory, number>;
  issuesBySeverity: Record<Severity, number>;
  filesAnalyzed: number;
  totalFiles: number;
  linesOfCode: number;
  averageComplexity: number;
  technicalDebtMinutes: number;
}

export type ScanJobStatus = "queued" | "running" | "completed" | "failed";

export interface ScanJob {
  id: string;
  projectId: string;
  status: ScanJobStatus;
  source: "upload" | "github";
  sourceLabel: string;
  filesDiscovered: number;
  filesAnalyzed: number;
  issueCount: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProjectFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface Project {
  id: string;
  name: string;
  source: "upload" | "github";
  repoFullName?: string;
  files: ProjectFile[];
  analyzedAt?: number;
  metrics?: CodeHealthMetrics;
  issues?: CodeIssue[];
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

// Database-backed types
export interface ScanHistoryEntry {
  id: string;
  overallScore: number;
  filesAnalyzed: number;
  issueCount: number;
  linesOfCode: number;
  techDebtMinutes: number;
  scannedAt: string;
}

// AI Settings types (matches extension pattern)
export type AiProvider = "openai" | "anthropic" | "gemini";

export interface AiSettings {
  aiProvider: AiProvider;
  apiKey: string;
}

export interface AiConfig {
  aiProvider?: string;
  apiKey?: string;
}
