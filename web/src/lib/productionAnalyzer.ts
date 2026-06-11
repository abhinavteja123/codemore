import { AstParser } from "../../../daemon/services/astParser";
import { StaticAnalyzer } from "../../../daemon/services/staticAnalyzer";
import { SeverityRemapper } from "../../../daemon/services/severityRemapper";
import type { FileContext as SharedFileContext } from "../../../shared/protocol";
import { calculateHealthScore, calculateTechnicalDebt, type IssueSeverityCounts } from "../../../shared/scoring";
import { identifyHotSpots, HotSpot } from "../../../shared/hotspotDetector";
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

  const issuesByFile = new Map<string, IssueSeverityCounts>();

  for (const issue of issues) {
    issuesByCategory[issue.category] += 1;
    issuesBySeverity[issue.severity] += 1;

    const filePath = issue.location.filePath;
    const fileCounts = issuesByFile.get(filePath) ?? {
      BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0,
    };
    fileCounts[issue.severity] += 1;
    issuesByFile.set(filePath, fileCounts);
  }

  // Per-file scoring — matches the daemon path in contextMap.ts; replaces the
  // legacy aggregate path that drifted from the daemon's score for the same input.
  const overallScore = calculateHealthScore(issuesByFile, files.length);

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

const DEFAULT_IGNORE_PATTERNS = ['node_modules', 'dist', 'build', '.next', 'coverage', '.git'];

function extractProjectConfig(files: ProjectFile[]): {
  analyzerConfig: { maxFunctionLength?: number; maxCyclomaticComplexity?: number; maxNestingDepth?: number };
  ignorePatterns: string[];
} {
  const configFile = files.find(f => CONFIG_FILENAMES.has(f.path.split('/').pop() ?? ''));
  if (!configFile) return { analyzerConfig: {}, ignorePatterns: DEFAULT_IGNORE_PATTERNS };
  try {
    const parsed = JSON.parse(configFile.content) as Record<string, unknown>;
    const analyzerConfig: { maxFunctionLength?: number; maxCyclomaticComplexity?: number; maxNestingDepth?: number } = {};
    if (typeof parsed.maxFunctionLength === 'number') analyzerConfig.maxFunctionLength = parsed.maxFunctionLength;
    if (typeof parsed.maxComplexity === 'number') analyzerConfig.maxCyclomaticComplexity = parsed.maxComplexity;
    if (typeof parsed.maxNestingDepth === 'number') analyzerConfig.maxNestingDepth = parsed.maxNestingDepth;
    const ignorePatterns = [
      ...DEFAULT_IGNORE_PATTERNS,
      ...(Array.isArray(parsed.ignore) ? (parsed.ignore as string[]) : []),
    ];
    return { analyzerConfig, ignorePatterns };
  } catch {
    return { analyzerConfig: {}, ignorePatterns: DEFAULT_IGNORE_PATTERNS };
  }
}

function matchesIgnorePattern(filePath: string, pattern: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const name = normalized.split('/').pop() ?? '';
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
    return re.test(name) || re.test(normalized);
  }
  return normalized.includes('/' + pattern) || normalized.includes(pattern + '/') || name === pattern;
}

function shouldSkipFile(filePath: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some(p => matchesIgnorePattern(filePath, p));
}

export async function analyzeProjectWithProductionCore(files: ProjectFile[]): Promise<{
  issues: CodeIssue[];
  metrics: CodeHealthMetrics;
  hotspots: HotSpot[];
}> {
  const parser = new AstParser();
  const { analyzerConfig, ignorePatterns } = extractProjectConfig(files);
  const staticAnalyzer = new StaticAnalyzer(analyzerConfig);
  const contexts: SharedFileContext[] = [];
  const allIssues: CodeIssue[] = [];

  const filesToAnalyze = files.filter(f => !shouldSkipFile(f.path, ignorePatterns));

  for (const file of filesToAnalyze) {
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
