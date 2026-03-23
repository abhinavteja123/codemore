import { AstParser } from "../../../daemon/services/astParser";
import { StaticAnalyzer } from "../../../daemon/services/staticAnalyzer";
import type { FileContext as SharedFileContext } from "../../../shared/protocol";
import { calculateHealthScoreFromTotals, calculateTechnicalDebt } from "../../../shared/scoring";
import {
  CodeHealthMetrics,
  CodeIssue,
  IssueCategory,
  ProjectFile,
  Severity,
} from "./types";
import { analyzeFile as analyzeFallbackFile } from "./analyzer";
import { logger, sanitizeError } from './logger';

const STATIC_PRIMARY_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".md",
  ".markdown",
  ".sh",
  ".bash",
  ".zsh",
]);

function getExtension(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith("dockerfile")) {
    return "dockerfile";
  }

  const dotIndex = lowerPath.lastIndexOf(".");
  return dotIndex >= 0 ? lowerPath.slice(dotIndex) : "";
}

function usesStaticAnalyzerAsPrimary(filePath: string): boolean {
  return STATIC_PRIMARY_EXTENSIONS.has(getExtension(filePath));
}

function dedupeIssues(issues: CodeIssue[]): CodeIssue[] {
  const seen = new Set<string>();
  const deduped: CodeIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.location.filePath,
      issue.location.range.start.line,
      issue.location.range.start.column,
      issue.category,
      issue.severity,
      issue.title,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function countMeaningfulLines(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0).length;
}

function buildMetrics(
  files: ProjectFile[],
  issues: CodeIssue[],
  contexts: SharedFileContext[]
): CodeHealthMetrics {
  const issuesByCategory: Record<IssueCategory, number> = {
    bug: 0,
    "code-smell": 0,
    performance: 0,
    security: 0,
    maintainability: 0,
    accessibility: 0,
    "best-practice": 0,
  };

  const issuesBySeverity: Record<Severity, number> = {
    BLOCKER: 0,
    CRITICAL: 0,
    MAJOR: 0,
    MINOR: 0,
    INFO: 0,
  };

  for (const issue of issues) {
    issuesByCategory[issue.category] += 1;
    issuesBySeverity[issue.severity] += 1;
  }

  // Calculate overall score using shared health scoring formula
  // Using the legacy function for backward compatibility (total counts instead of per-file)
  const overallScore = calculateHealthScoreFromTotals(issuesBySeverity, files.length);

  // Calculate technical debt using shared formula
  const technicalDebtMinutes = calculateTechnicalDebt(issuesBySeverity);

  const linesOfCode = files.reduce(
    (total, file) => total + countMeaningfulLines(file.content),
    0
  );

  const totalComplexity = contexts.reduce(
    (total, context) =>
      total + context.symbols.filter((symbol) => symbol.kind === "function").length,
    0
  );

  return {
    overallScore,
    issuesByCategory,
    issuesBySeverity,
    filesAnalyzed: files.length,
    totalFiles: files.length,
    linesOfCode,
    averageComplexity: files.length > 0 ? totalComplexity / files.length : 0,
    technicalDebtMinutes,
  };
}

export async function analyzeProjectWithProductionCore(files: ProjectFile[]): Promise<{
  issues: CodeIssue[];
  metrics: CodeHealthMetrics;
}> {
  const parser = new AstParser();
  const staticAnalyzer = new StaticAnalyzer();
  const contexts: SharedFileContext[] = [];
  const allIssues: CodeIssue[] = [];

  for (const file of files) {
    let staticIssues: CodeIssue[] = [];
    let context: SharedFileContext | null = null;

    try {
      const ast = await parser.parse(file.path, file.content);
      context = parser.extractContext(file.path, ast, file.content);
      contexts.push(context);

      staticIssues = staticAnalyzer.analyze(
        file.path,
        file.content,
        context,
        ast.sourceFile ?? undefined
      ) as unknown as CodeIssue[];
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, '[productionAnalyzer] Static analysis failed');
    }

    if (usesStaticAnalyzerAsPrimary(file.path)) {
      allIssues.push(...dedupeIssues(staticIssues));
      continue;
    }

    const fallbackIssues = analyzeFallbackFile(file);
    allIssues.push(...dedupeIssues([...staticIssues, ...fallbackIssues]));
  }

  const issues = dedupeIssues(allIssues);
  return {
    issues,
    metrics: buildMetrics(files, issues, contexts),
  };
}
