import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scanProject, detectLanguage } from "../../../daemon/cli/projectScanner";
import { registerAllPacks } from "../../../daemon/cli/registerPacks";
import { reportIssueToCodeIssue } from "../../../daemon/services/registryAdapter";
import { SeverityRemapper } from "../../../daemon/services/severityRemapper";
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

/**
 * ARCHITECTURE NOTE: Web scanning ("one brain, many skins")
 *
 * The web now runs the SAME registry pipeline as the CLI / MCP / VS Code
 * extension: uploaded files are materialized into a scan-local temp
 * directory (serverless-safe: os.tmpdir()) and passed to scanProject() —
 * the exact core call the CLI makes. That gives the web the full brain:
 * rule packs, .codemorerc.json, .gitignore-aware walking, framework
 * detection, and project-level (cross-file) rules.
 *
 * Two deliberate differences from the CLI remain:
 *   1. NO external tool binaries (Biome, Ruff, …) — serverless can't run them.
 *   2. Languages the registry doesn't route (html/css/go/java/…) keep the
 *      lightweight regex fallback in analyzer.ts so existing web coverage
 *      for those doesn't silently drop.
 */

// Singleton remapper — applied ONLY to fallback-analyzer issues. Registry
// issues are deliberately NOT remapped so web results stay identical to
// the CLI / extension for the same input.
const severityRemapper = new SeverityRemapper();

let packsRegistered = false;
function ensurePacks(): void {
  if (packsRegistered) return;
  registerAllPacks();
  packsRegistered = true;
}

/** True when the registry routes this file to a language pack. */
function registryCoversFile(filePath: string): boolean {
  const base = path.basename(filePath.replace(/\\/g, "/"));
  return detectLanguage(base, path.extname(base).toLowerCase()) !== null;
}

/**
 * Write the in-memory ProjectFile[] into a fresh temp directory so the
 * fs-based scanProject() walker can run against it. Returns the root.
 *
 * Trust boundary: paths come from user uploads (zip entries, GitHub tree
 * paths) — anything absolute or escaping the scan root is skipped.
 */
function materializeToTempDir(files: ProjectFile[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codemore-web-scan-"));
  const rootResolved = path.resolve(root);
  for (const file of files) {
    const rel = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const abs = path.resolve(rootResolved, rel);
    if (!abs.startsWith(rootResolved + path.sep)) {
      logger.warn({ file: file.path }, "[productionAnalyzer] Skipping path escaping scan root");
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, file.content, "utf8");
    } catch (error) {
      logger.warn({ err: sanitizeError(error), file: rel }, "[productionAnalyzer] Failed to materialize file");
    }
  }
  return rootResolved;
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
  issues: CodeIssue[]
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
    // Registry categories outside the legacy keyspace land in 'code-smell'
    // so the dashboard charts never see an undefined bucket (same coercion
    // the extension daemon applies in deriveMetricsFromSummary).
    const category = issue.category in issuesByCategory ? issue.category : "code-smell";
    issuesByCategory[category] += 1;
    issuesBySeverity[issue.severity] += 1;

    const filePath = issue.location.filePath;
    const fileCounts = issuesByFile.get(filePath) ?? {
      BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0,
    };
    fileCounts[issue.severity] += 1;
    issuesByFile.set(filePath, fileCounts);
  }

  // Per-file scoring — same shared formula the CLI's report summary uses.
  const overallScore = calculateHealthScore(issuesByFile, files.length);

  // Calculate technical debt using shared formula
  const technicalDebtMinutes = calculateTechnicalDebt(issuesBySeverity);

  const linesOfCode = files.reduce(
    (total, file) => total + countMeaningfulLines(file.content),
    0
  );

  return {
    overallScore,
    issuesByCategory,
    issuesBySeverity,
    filesAnalyzed: files.length,
    totalFiles: files.length,
    linesOfCode,
    // Registry doesn't track averageComplexity; 0 reads as "n/a" in the UI
    // (matches the extension dashboard after its registry migration).
    averageComplexity: 0,
    technicalDebtMinutes,
  };
}

export async function analyzeProjectWithProductionCore(files: ProjectFile[]): Promise<{
  issues: CodeIssue[];
  metrics: CodeHealthMetrics;
  hotspots: HotSpot[];
}> {
  ensurePacks();

  // 1. Registry scan — the shared brain.
  let registryIssues: CodeIssue[] = [];
  const scanRoot = materializeToTempDir(files);
  try {
    const report = await scanProject({
      root: scanRoot,
      // Match the extension daemon's analyzeWorkspace setting.
      enableExperimental: true,
    });
    // No root passed to the mapper: evidence paths stay relative and line
    // up with ProjectFile.path, and server temp paths never leak to the UI.
    registryIssues = report.issues.map(
      (iss) => reportIssueToCodeIssue(iss) as unknown as CodeIssue
    );
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, '[productionAnalyzer] Registry scan failed');
  } finally {
    try {
      fs.rmSync(scanRoot, { recursive: true, force: true });
    } catch {
      // Best-effort temp cleanup; serverless containers discard /tmp anyway.
    }
  }

  // 2. Regex fallback for languages the registry doesn't route.
  const fallbackIssues: CodeIssue[] = [];
  for (const file of files) {
    if (registryCoversFile(file.path)) {
      continue;
    }
    fallbackIssues.push(...analyzeFallbackFile(file));
  }
  const remappedFallback = severityRemapper.remapIssues(
    dedupeIssues(fallbackIssues)
  ) as unknown as CodeIssue[];

  const issues = [...registryIssues, ...remappedFallback];

  // Detect hotspots from all issues
  const hotspots = identifyHotSpots(issues);
  logger.info(`Identified ${hotspots.length} hotspots from ${issues.length} issues`);

  return {
    issues,
    metrics: buildMetrics(files, issues),
    hotspots,
  };
}
