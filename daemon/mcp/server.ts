/* codemore-ignore-file: core-quality-async-without-await */
/* MCP SDK tool handlers MUST be async by contract; the handler body may not
   use await when the work is a synchronous lookup (suggest_fix, explain_issue).
   The async marker is part of the API, not a code smell. */

/**
 * CodeMore MCP Server
 *
 * Exposes the rule registry to any coding agent that speaks the Model
 * Context Protocol (Claude Code, Cursor, Codex, …) via stdio.
 *
 * Tools:
 *   scan_project   — full project scan, returns a CodeMoreReport.
 *   scan_file      — single-file scan, returns the issues for that file.
 *   explain_issue  — expanded rationale + citation for an issue by instanceId.
 *   suggest_fix    — fix template + verification criteria by instanceId.
 *
 * The server is its own process. The CLI subcommand `codemore serve-mcp`
 * launches it and connects stdio. Agents register it as an MCP server.
 */

import { z } from 'zod';
import type { ReportIssue } from '../../shared/report/types';
import { scanProject } from '../cli/projectScanner';
import { registerAllPacks } from '../cli/registerPacks';
import { globalRegistry } from '../../shared/rules/registry';
import type { RuleContext } from '../../shared/rules/Rule';
import { validateFix } from '../services/validatorHarness';
import { runAgenticFix, buildFixPrompt } from '../services/agenticFixer';
import { toolVersion } from '../../shared/toolVersion';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// CJS-friendly imports — the SDK ships both ESM and CJS builds, and our
// daemon tsconfig is commonjs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Cache findings produced by the most recent scans so explain_issue and
// suggest_fix can look up by instanceId without a re-scan. Bounded by an
// LRU-ish size cap to avoid unbounded growth.
const MAX_CACHED_ISSUES = 5000;
const issueCache = new Map<string, ReportIssue>();

function cacheIssues(issues: ReadonlyArray<ReportIssue>): void {
  for (const iss of issues) {
    if (issueCache.size >= MAX_CACHED_ISSUES) {
      const firstKey = issueCache.keys().next().value;
      if (firstKey !== undefined) {issueCache.delete(firstKey);}
    }
    issueCache.set(iss.instanceId, iss);
  }
}

function textResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function buildSingleFileContext(filePath: string, content: string, languageHint?: string): RuleContext {
  // Infer language from extension; allow the caller to override.
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const extension = dot >= 0 ? lower.slice(dot) : '';
  const basename = filePath.replace(/^.*[/\\]/, '');
  let language = languageHint;
  if (!language) {
    if (basename === '.env' || basename.startsWith('.env.')) {language = 'env';}
    else if (extension === '.ts' || extension === '.tsx') {language = 'typescript';}
    else if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') {language = 'javascript';}
    else if (extension === '.sql') {language = 'sql';}
    else if (extension === '.json' || extension === '.jsonc') {language = 'json';}
    else if (extension === '.yaml' || extension === '.yml') {language = 'yaml';}
    else if (extension === '.md' || extension === '.markdown') {language = 'markdown';}
    else if (extension === '.sh' || extension === '.bash' || extension === '.zsh') {language = 'shell';}
    else if (extension === '.py' || extension === '.pyi') {language = 'python';}
    else {language = 'unknown';}
  }
  // Parse a TS AST for TS/JS files so AST-based rules can run. Without
  // this every AST rule silently returns no findings on scan_file while
  // the same file scanned via scan_project reports them — the exact
  // silent-miss the validator harness guards against (validatorHarness.ts).
  let sourceFile: ts.SourceFile | null = null;
  if (language === 'typescript' || language === 'javascript') {
    try {
      sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    } catch {
      sourceFile = null;
    }
  }
  return {
    filePath,
    extension,
    language,
    content,
    lines: content.split('\n'),
    sourceFile,
    frameworks: [],
  };
}

/**
 * Build and connect an MCP server over stdio. Returns when the connection closes.
 */
export async function runMcpServer(): Promise<void> {
  registerAllPacks();

  const server = new McpServer({ name: 'codemore', version: toolVersion() });

  // ---------------------------------------------------------------------
  // scan_project
  // ---------------------------------------------------------------------
  server.tool(
    'scan_project',
    'Scan a project directory and return a CodeMoreReport. Use this first to find issues, ' +
      'then call suggest_fix(instanceId) per issue. Each fix should be validated by re-running ' +
      'scan_project on the touched file.',
    {
      rootPath: z.string().describe('Absolute or workspace-relative path to the project root.'),
      enableExperimental: z
        .boolean()
        .optional()
        .describe('Include rules in lifecycle=experimental. Default false (matches the CLI) — set to true if you want noisier coverage. As of v0.2.1 the calibrated catalog is beta-tier; experimental contains rules pending precision tuning (e.g. core-quality-duplicate-string).'),
      packs: z
        .array(z.string())
        .optional()
        .describe('Limit to specific packs (e.g. ["vibe-supabase"]). Default: all registered packs.'),
      frameworks: z
        .array(z.string())
        .optional()
        .describe('Framework hints attached to every file context (e.g. ["supabase","next.js"]).'),
    },
    async ({ rootPath, enableExperimental, packs, frameworks }: {
      rootPath: string;
      enableExperimental?: boolean;
      packs?: string[];
      frameworks?: string[];
    }) => {
      // A nonexistent root must be a loud error, not an empty "clean"
      // report — an agent reading zero issues would wrongly conclude the
      // project passed the scan.
      if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'root-not-found', message: `rootPath does not exist or is not a directory: ${rootPath}` }),
          }],
          isError: true,
        };
      }
      const report = await scanProject({
        root: rootPath,
        enableExperimental: enableExperimental ?? false,
        enabledPacks: packs,
        frameworks: frameworks ?? [],
      });
      cacheIssues(report.issues);
      return textResult(report);
    },
  );

  // ---------------------------------------------------------------------
  // scan_file
  // ---------------------------------------------------------------------
  server.tool(
    'scan_file',
    'Scan a single file by passing its content inline. Useful when the agent has the file ' +
      'in memory and wants to re-check after an edit without writing to disk first.',
    {
      filePath: z.string().describe('Logical file path (used for relative-path output and rule routing).'),
      content: z.string().describe('Full file content as text.'),
      language: z
        .string()
        .optional()
        .describe('Override the inferred language (one of: typescript, javascript, sql, env, json, yaml, markdown, shell, python).'),
      packs: z.array(z.string()).optional(),
      enableExperimental: z.boolean().optional(),
    },
    async ({ filePath, content, language, packs, enableExperimental }: {
      filePath: string;
      content: string;
      language?: string;
      packs?: string[];
      enableExperimental?: boolean;
    }) => {
      const ctx = buildSingleFileContext(filePath, content, language);
      const result = globalRegistry.scanFile(ctx, {
        enabledPacks: packs,
        enableExperimental: enableExperimental ?? false,
      });
      cacheIssues(result.issues);
      return textResult({ issues: result.issues, diagnostics: result.diagnostics, rulesEvaluated: result.rulesEvaluated });
    },
  );

  // ---------------------------------------------------------------------
  // explain_issue
  // ---------------------------------------------------------------------
  server.tool(
    'explain_issue',
    'Return the full rationale + citation + suggested fix template for a previously discovered issue by instanceId.',
    {
      instanceId: z.string().describe('The instanceId field from a previous scan_project / scan_file result.'),
    },
    async ({ instanceId }: { instanceId: string }) => {
      const iss = issueCache.get(instanceId);
      if (!iss) {
        return textResult({
          error: 'unknown-instance-id',
          message: 'No issue with this instanceId is cached. Re-run scan_project to populate.',
        });
      }
      return textResult({
        id: iss.id,
        title: iss.title,
        severity: iss.severity,
        confidence: iss.confidence,
        category: iss.category,
        whyItMatters: iss.whyItMatters,
        citation: iss.citation,
        evidence: iss.evidence,
        suggestedFix: iss.suggestedFix,
        suppression: iss.suppression,
      });
    },
  );

  // ---------------------------------------------------------------------
  // suggest_fix
  // ---------------------------------------------------------------------
  server.tool(
    'suggest_fix',
    'Return only the suggestedFix block for an issue. Lighter than explain_issue when the ' +
      'agent already has the report and just needs the patch instructions + verification criteria.',
    {
      instanceId: z.string().describe('The instanceId field from a previous scan.'),
    },
    async ({ instanceId }: { instanceId: string }) => {
      const iss = issueCache.get(instanceId);
      if (!iss) {
        return textResult({
          error: 'unknown-instance-id',
          message: 'No issue with this instanceId is cached. Re-run scan_project to populate.',
        });
      }
      if (!iss.suggestedFix) {
        return textResult({
          ruleId: iss.id,
          message: 'This rule does not yet provide a structured fix template. See whyItMatters for guidance.',
        });
      }
      return textResult({
        ruleId: iss.id,
        ruleVersion: iss.ruleVersion,
        targetFile: iss.evidence.file,
        targetLine: iss.evidence.line,
        suggestedFix: iss.suggestedFix,
      });
    },
  );

  // ---------------------------------------------------------------------
  // validate_fix — closes the agentic loop.
  // ---------------------------------------------------------------------
  server.tool(
    'validate_fix',
    'After you propose a fix, call this with the issue\'s instanceId and the proposed new file ' +
      'content. The harness re-runs the same rules in-memory on the new content and returns ' +
      'pass/fail. Use this as the stop signal for your fix-then-verify loop: if passed=true, ' +
      'apply the patch on disk; if passed=false, feed the diagnostic back into your planner and retry.',
    {
      instanceId: z
        .string()
        .describe('The instanceId field from a previous scan_project / scan_file result.'),
      newContent: z
        .string()
        .describe('The proposed new full content of the file. Replacement-only — no unified diffs yet.'),
      includeOtherRules: z
        .boolean()
        .optional()
        .describe('Also report findings from rules other than the targeted one. Useful for "did my fix introduce a new issue?" checks. Default false.'),
    },
    async ({ instanceId, newContent, includeOtherRules }: {
      instanceId: string;
      newContent: string;
      includeOtherRules?: boolean;
    }) => {
      const iss = issueCache.get(instanceId);
      if (!iss) {
        return textResult({
          error: 'unknown-instance-id',
          message: 'No issue with this instanceId is cached. Re-run scan_project to populate.',
        });
      }
      const result = validateFix(iss, newContent, {
        enableExperimental: true,
        includeOtherRules: includeOtherRules ?? false,
      });
      return textResult(result);
    },
  );

  // ---------------------------------------------------------------------
  // apply_fix — orchestrates planner → generator → validator → retry.
  //
  // The MCP transport speaks to ONE agent at a time over stdio. That agent
  // IS the generator. So the tool does NOT bundle a generator implementation
  // — instead it returns the prompt the agent should consume, accepts the
  // agent's proposed content back through `propose_fix`, and validates.
  // For one-shot in-process generators (CLI use), the lower-level
  // `runAgenticFix` import is the right entry point.
  // ---------------------------------------------------------------------
  server.tool(
    'apply_fix',
    'For a previously discovered issue (by instanceId), returns the prompt + verification ' +
      'criteria you should use to produce a fix. After you generate proposed file content, call ' +
      'validate_fix to confirm before writing to disk. Repeat up to 3 attempts if validate_fix ' +
      'reports FAIL, feeding the validator diagnostic back into your next attempt.',
    {
      instanceId: z.string().describe('instanceId from a previous scan.'),
    },
    async ({ instanceId }: { instanceId: string }) => {
      const iss = issueCache.get(instanceId);
      if (!iss) {
        return textResult({
          error: 'unknown-instance-id',
          message: 'No issue with this instanceId is cached. Re-run scan_project to populate.',
        });
      }
      const absPath = path.isAbsolute(iss.evidence.file)
        ? iss.evidence.file
        : path.resolve(process.cwd(), iss.evidence.file);
      let currentContent = '';
      try { currentContent = fs.readFileSync(absPath, 'utf8'); } catch { /* let agent know */ }
      const prompt = buildFixPrompt({ issue: iss, currentContent, attempt: 1 });
      return textResult({
        instanceId,
        ruleId: iss.id,
        severity: iss.severity,
        targetFile: iss.evidence.file,
        prompt,
        loopProtocol: [
          'Generate the proposed full file content from the prompt.',
          'Call validate_fix(instanceId, newContent) to check.',
          'On PASS: write the content to disk and move on.',
          'On FAIL: call apply_fix again with the same instanceId; the prompt will not change but you can use the failure diagnostic from validate_fix in your retry.',
          'Cap at 3 attempts per issue.',
        ],
      });
    },
  );

  // ---------------------------------------------------------------------
  // run_agentic_fix — single-shot in-process fixer for callers that BRING
  // their own generator. Experimental: registered only when
  // CODEMORE_MCP_IN_PROCESS_GENERATOR=1 is set, and NOT part of the public
  // 6-tool MCP contract. No CLI wrapper exists yet.
  // The MCP transport itself cannot run this since the generator IS the
  // remote agent; this tool is for SDK consumers that have a local LLM
  // client wired up.
  // ---------------------------------------------------------------------
  if (process.env.CODEMORE_MCP_IN_PROCESS_GENERATOR === '1') {
    server.tool(
      'run_agentic_fix',
      'In-process fixer: runs the planner → generator → validator → retry loop in one call. ' +
        'Requires a locally-configured generator (set CODEMORE_MCP_IN_PROCESS_GENERATOR=1). ' +
        'Most agents should use apply_fix + validate_fix instead.',
      {
        instanceId: z.string(),
        workspaceRoot: z.string(),
        maxAttempts: z.number().optional(),
      },
      async ({ instanceId, workspaceRoot, maxAttempts }: { instanceId: string; workspaceRoot: string; maxAttempts?: number }) => {
        const iss = issueCache.get(instanceId);
        if (!iss) {
          return textResult({ error: 'unknown-instance-id' });
        }
        const result = await runAgenticFix({
          workspaceRoot,
          issue: iss,
          generate: async (_prompt: string) => {
            throw new Error(
              'No in-process generator wired. Provide one via SDK or use apply_fix + validate_fix.',
            );
          },
          options: { maxAttempts: maxAttempts ?? 3 },
        });
        return textResult(result);
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('codemore: MCP server connected to stdio transport\n');
  // Block the process until stdin closes — server.connect resolves once
  // the transport is wired but the handlers are async, so the event loop
  // must stay alive. process.stdin keeping its 'data' listener active does
  // that for us; this promise never resolves intentionally.
  await new Promise<void>(() => { /* run forever */ });
}
