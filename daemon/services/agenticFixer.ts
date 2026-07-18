/**
 * Agentic Fixer — the planner → generator → validator → retry loop that
 * closes the find-then-fix cycle.
 *
 * The thesis: a static analyzer that just finds bugs is half the value.
 * The other half is letting an AI agent fix them deterministically. To
 * make that loop reliable, the agent needs:
 *
 *   1. A precise prompt (the rule's citation + evidence + the relevant
 *      file content). Done here by `buildFixPrompt`.
 *   2. A generator that produces a candidate patch. Provided as a
 *      dependency-injected function — this keeps the orchestrator free
 *      of provider lock-in (OpenAI / Anthropic / Gemini / local LLM /
 *      stub-for-tests).
 *   3. A validator that says PASS/FAIL deterministically. That's
 *      `validatorHarness.validateFix`.
 *   4. A retry policy. The orchestrator feeds the validator's failure
 *      diagnostic back into the next prompt, capped at `maxAttempts`
 *      (default 3 per Snyk Agent Fix's published convergence curve).
 *
 * The orchestrator does NOT touch disk. The caller decides whether to
 * persist the final patch. This keeps the agent in control of commit
 * timing and lets multi-issue runs batch writes.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ReportIssue } from '../../shared/report/types';
import { validateFix, type ValidationResult } from './validatorHarness';

/**
 * The signature every LLM provider plugs into. It receives a single
 * prompt string and returns the proposed full new file content as a
 * single string. The orchestrator deliberately leaves provider concerns
 * (model selection, temperature, retries on network error, token
 * budgeting) to the implementation — there's exactly one decision the
 * orchestrator cares about: what comes out of the generator goes
 * straight into the validator.
 *
 * Implementations MUST return the COMPLETE proposed file content, not
 * a diff. Diff-applicators belong upstream of the generator.
 */
export type FixGenerator = (prompt: string) => Promise<string>;

export interface AgenticFixerOptions {
  /** Maximum loop iterations before giving up. Default 3. */
  maxAttempts?: number;
  /**
   * When true, validation results include findings from OTHER rules,
   * letting the agent reject patches that introduce regressions.
   * Default true — failing fast is better than committing a fix that
   * breaks a different rule.
   */
  rejectOnNewFindings?: boolean;
}

export interface AttemptRecord {
  attempt: number;
  prompt: string;
  proposedContent: string;
  validation: ValidationResult;
}

export interface AgenticFixerResult {
  status: 'applied' | 'failed';
  /** Number of generator+validator passes consumed. */
  attempts: number;
  /** Full per-attempt history (useful for telemetry / debugging). */
  history: AttemptRecord[];
  /** The final patched content when status='applied'; undefined when failed. */
  finalContent?: string;
  /** Why we stopped — one sentence the agent can show its user. */
  reason: string;
}

/**
 * Build a deterministic prompt for the generator. The shape matches
 * `agentInstructions` in the JSON report: rule citation, evidence
 * snippet, file content with line numbers, suggested-fix instructions,
 * verification criteria, and (on retry) the previous validator
 * diagnostic so the planner can iterate.
 */
export function buildFixPrompt(args: {
  issue: ReportIssue;
  currentContent: string;
  previousValidation?: ValidationResult;
  previousProposed?: string;
  attempt: number;
}): string {
  const { issue, currentContent, previousValidation, previousProposed, attempt } = args;
  const numbered = currentContent
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4, ' ')}  ${line}`)
    .join('\n');

  let fixHints: string;
  if (issue.suggestedFix) {
    const criteria = issue.suggestedFix.verificationCriteria ?? [];
    fixHints =
      `Suggested-fix instructions from the rule:\n${issue.suggestedFix.instructions}\n\n` +
      (criteria.length > 0
        ? `Verification criteria the fix MUST satisfy:\n` + criteria.map(c => `  - ${c}`).join('\n')
        : 'No structured verification criteria attached; the validator will re-run the rule and PASS/FAIL on whether it still fires.');
  } else {
    fixHints = 'No structured fix template is attached to this rule. Use the rule\'s whyItMatters and citation to plan.';
  }

  const retryBlock = previousValidation && previousProposed
    ? `\n\n--- Previous attempt diagnostic ---\n` +
      `On attempt ${attempt - 1} the validator returned:\n  ${previousValidation.summary}\n\n` +
      `The proposed content that failed was:\n\`\`\`\n${previousProposed}\n\`\`\`\n\n` +
      `Address the validator's complaint specifically. The rule must NOT fire at the original location after your patch.`
    : '';

  return [
    `You are fixing a CodeMore finding. Your output must be the COMPLETE new file content, nothing else — no markdown fences, no commentary, no diff format. The validator will pass your output verbatim to the rule registry and re-run the same detector.`,
    ``,
    `Rule:        ${issue.id}@${issue.ruleVersion}`,
    `Severity:    ${issue.severity}`,
    `Confidence:  ${issue.confidence}`,
    `Citation:    ${issue.citation}`,
    ``,
    `Why this matters:`,
    issue.whyItMatters,
    ``,
    `Evidence:`,
    `  file:    ${issue.evidence.file}`,
    `  line:    ${issue.evidence.line}`,
    `  column:  ${issue.evidence.column}`,
    `  snippet: ${issue.evidence.snippet}`,
    `  matched: ${issue.evidence.matchedPattern ?? '(unspecified)'}`,
    ``,
    fixHints,
    ``,
    `Current file content (with 1-indexed line numbers; reproduce the FILE without the line-number prefix):`,
    numbered,
    retryBlock,
    ``,
    `Output: the complete new file content. No fences. No commentary.`,
  ].join('\n');
}

/**
 * Strip Markdown code fences a generator may have wrapped its output in
 * despite our instructions. Common shapes:
 *   ```ts\n...\n```
 *   ```\n...\n```
 *   ```typescript\n...\n```
 *
 * The function is conservative: it only strips when the WHOLE output is
 * one fenced block. Inline fenced blocks in the middle of a file (e.g.
 * a markdown fixture) are preserved.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceStart = /^```[A-Za-z0-9_+-]*\s*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(trimmed) && fenceEnd.test(trimmed)) {
    return trimmed.replace(fenceStart, '').replace(fenceEnd, '');
  }
  return text;
}

/**
 * Run the planner → generator → validator loop for a single issue.
 *
 * Does NOT touch disk. The caller decides whether to persist
 * `result.finalContent` after the loop returns 'applied'.
 *
 * The issue must carry an absolute or workspace-relative file path
 * that the orchestrator can resolve against `workspaceRoot`. If the
 * file does not exist, the loop short-circuits with `failed`.
 */
export async function runAgenticFix(args: {
  workspaceRoot: string;
  issue: ReportIssue;
  generate: FixGenerator;
  options?: AgenticFixerOptions;
}): Promise<AgenticFixerResult> {
  const maxAttempts = args.options?.maxAttempts ?? 3;
  const rejectOnNewFindings = args.options?.rejectOnNewFindings ?? true;

  const absPath = path.isAbsolute(args.issue.evidence.file)
    ? args.issue.evidence.file
    : path.resolve(args.workspaceRoot, args.issue.evidence.file);

  let currentContent: string;
  try {
    currentContent = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return {
      status: 'failed',
      attempts: 0,
      history: [],
      reason: `Could not read source file at ${absPath}: ${(err as Error).message}`,
    };
  }

  const history: AttemptRecord[] = [];
  let lastValidation: ValidationResult | undefined;
  let lastProposed: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildFixPrompt({
      issue: args.issue,
      currentContent,
      previousValidation: lastValidation,
      previousProposed: lastProposed,
      attempt,
    });

    let proposedRaw: string;
    try {
      proposedRaw = await args.generate(prompt);
    } catch (err) {
      const validation: ValidationResult = {
        passed: false,
        ruleStillFires: true,
        ruleFiresElsewhere: false,
        remainingForRule: 0,
        remainingFindings: [],
        diagnostics: [`generator-error: ${(err as Error).message}`],
        summary: `FAIL — generator threw: ${(err as Error).message}`,
      };
      history.push({ attempt, prompt, proposedContent: '', validation });
      return {
        status: 'failed',
        attempts: attempt,
        history,
        reason: `Generator failed on attempt ${attempt}: ${(err as Error).message}`,
      };
    }

    const proposed = stripCodeFences(proposedRaw);
    // enableExperimental deliberately unset: validatorHarness defaults it
    // to false (scan-surface parity) unless the targeted issue is itself
    // experimental — hardcoding true here rejected fixes for findings the
    // scan surfaces never report.
    const validation = validateFix(args.issue, proposed, {
      includeOtherRules: rejectOnNewFindings,
    });

    history.push({ attempt, prompt, proposedContent: proposed, validation });

    if (validation.passed && !introducedNewFindings(args.issue, validation, rejectOnNewFindings)) {
      return {
        status: 'applied',
        attempts: attempt,
        history,
        finalContent: proposed,
        reason: `PASS on attempt ${attempt}. ${validation.summary}`,
      };
    }

    lastValidation = validation;
    lastProposed = proposed;
  }

  return {
    status: 'failed',
    attempts: maxAttempts,
    history,
    reason:
      `Exhausted ${maxAttempts} attempts. Last validator verdict: ` +
      (lastValidation?.summary ?? 'no validation produced — generator never returned'),
  };
}

/**
 * Did this validation result surface findings OTHER than the targeted
 * rule's resolution? Used to gate on "fix didn't break something else".
 *
 * When `rejectOnNewFindings` is false, the answer is always false.
 */
function introducedNewFindings(
  issue: ReportIssue,
  validation: ValidationResult,
  rejectOnNewFindings: boolean,
): boolean {
  if (!rejectOnNewFindings) return false;
  for (const f of validation.remainingFindings) {
    if (f.id === issue.id) continue; // resolved or counted by ruleFiresElsewhere
    return true;
  }
  return false;
}
