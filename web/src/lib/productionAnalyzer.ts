import { AstParser } from "../../../daemon/services/astParser";
import { StaticAnalyzer } from "../../../daemon/services/staticAnalyzer";
import { SeverityRemapper } from "../../../daemon/services/severityRemapper";
import type { FileContext as SharedFileContext } from "../../../shared/protocol";
import { calculateHealthScoreFromTotals, calculateTechnicalDebt } from "../../../shared/scoring";
import { identifyHotSpots, HotSpot, getTopHotSpots } from "../../../shared/hotspotDetector";
import {
  CodeHealthMetrics,
  CodeIssue,
  IssueCategory,
  ProjectFile,
  Severity,
} from "./types";
import { analyzeFile as analyzeFallbackFile } from "./analyzer";
import { logger, sanitizeError } from './logger';

// Singleton remapper for consistency with daemon
const severityRemapper = new SeverityRemapper();

/**
 * ARCHITECTURE NOTE: Web vs Extension Scanning Differences
 * 
 * Extension (daemon):
 *   1. ExternalToolRunner (Biome, Ruff, Semgrep, TFLint, Checkov) - runs binaries
 *   2. StaticAnalyzer (TypeScript AST-based)
 *   3. SeverityRemapper (reduces false positives)
 * 
 * Web (serverless):
 *   1. StaticAnalyzer (same as daemon - imported directly)
 *   2. SeverityRemapper (same as daemon - NOW ADDED)
 *   3. NO external tools (cannot execute binaries on Vercel/serverless)
 * 
 * This means web analysis covers ~60% of what the extension provides.
 * For full analysis, users should use the VS Code extension.
 */

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

const CONFIG_FILENAMES = new Set(['.codemorerc.json', '.codemorerc', 'codemorerc.json']);

function extractAnalyzerConfig(files: ProjectFile[]): { maxFunctionLength?: number; maxCyclomaticComplexity?: number; maxNestingDepth?: number } {
  const configFile = files.find(f => CONFIG_FILENAMES.has(f.path.split('/').pop() ?? ''));
  if (!configFile) return {};
  try {
    const parsed = JSON.parse(configFile.content) as Record<string, unknown>;
    const result: { maxFunctionLength?: number; maxCyclomaticComplexity?: number; maxNestingDepth?: number } = {};
    if (typeof parsed.maxFunctionLength === 'number') result.maxFunctionLength = parsed.maxFunctionLength;
    if (typeof parsed.maxComplexity === 'number') result.maxCyclomaticComplexity = parsed.maxComplexity;
    if (typeof parsed.maxNestingDepth === 'number') result.maxNestingDepth = parsed.maxNestingDepth;
    return result;
  } catch {
    return {};
  }
}

export async function analyzeProjectWithProductionCore(files: ProjectFile[]): Promise<{
  issues: CodeIssue[];
  metrics: CodeHealthMetrics;
  hotspots: HotSpot[];
}> {
  const parser = new AstParser();
  const configOverrides = extractAnalyzerConfig(files);
  const staticAnalyzer = new StaticAnalyzer(configOverrides);
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

  // Apply severity remapping for consistency with extension daemon
  // This reduces false positives and applies context-aware severity adjustments
  const remappedIssues = severityRemapper.remapIssues(dedupeIssues(allIssues));
  
  // Detect hotspots from all issues
  const hotspots = identifyHotSpots(remappedIssues);
  logger.info(`Identified ${hotspots.length} hotspots from ${remappedIssues.length} issues`);

  return {
    issues: remappedIssues,
    metrics: buildMetrics(files, remappedIssues, contexts),
    hotspots,
  };
}
