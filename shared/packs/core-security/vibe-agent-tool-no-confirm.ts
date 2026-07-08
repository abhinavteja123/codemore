/**
 * Rule: vibe-agent-tool-no-confirm
 *
 * Detects an agent tool function with a destructive verb in its name
 * (delete_*, drop_*, send_*, deploy_*, exec_*, run_*, charge_*,
 * transfer_*, rm_*) that is registered with an LLM SDK without an
 * explicit confirmation gate.
 *
 * Patterns (TS / JS):
 *   - OpenAI function-calling tools array: `tools = [{ type: 'function',
 *     function: { name: 'delete_database', ... } }]`
 *   - Anthropic tool-use: `tools = [{ name: 'send_email', ... }]`
 *   - LangChain Tool: `new Tool({ name: 'transfer_funds', ... })`,
 *     `tool({ name: 'drop_table', ... })`
 *
 * Patterns (Python):
 *   - @tool decorator (LangChain): `@tool` over a function whose name
 *     starts with a destructive verb
 *   - openai.tools = [{ "name": "delete_*", ... }]
 *
 * Confirm pass: we look for a `requires_confirmation`, `confirm`,
 * `approval`, `human_in_the_loop`, `interruptable=True`, or a
 * `before_run`/`pre_invoke` hook in the same tool definition object.
 *
 * Severity: MAJOR (would be BLOCKER for irreversible ops, but the
 * static signal is too noisy to claim that confidence). Lifecycle:
 * experimental — agent SDK shapes vary enough that calibration is
 * required before promote.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const DESTRUCTIVE_VERB_RE = /\b(?:delete|drop|rm|remove|destroy|send|email|deploy|transfer|charge|refund|migrate|truncate|reset|kill|terminate|cancel|exec_|run_|spawn_)/i;

// JS/TS: { name: '<verb>...', ... }
const JS_TOOL_RE = /\{\s*(?:type\s*:\s*['"]function['"]\s*,\s*function\s*:\s*\{[^}]*)?name\s*:\s*['"]([a-zA-Z_][\w]*)['"]\s*,([^}]*)\}/g;
// new Tool({ name: '...' }) / tool({ name: '...' })
const JS_NEW_TOOL_RE = /\b(?:new\s+Tool|tool)\s*\(\s*\{\s*[^}]*?name\s*:\s*['"]([a-zA-Z_][\w]*)['"]\s*,([^}]*)\}/g;

// Python: @tool over def <verb>_*(...)
const PY_TOOL_DECORATOR_RE = /@tool[\s\S]{0,200}?def\s+([a-zA-Z_][\w]*)\s*\(/g;
// dict literal in Python: "name": "delete_*"
const PY_TOOL_DICT_RE = /["']name["']\s*:\s*["']([a-zA-Z_][\w]*)["'][^}]*?\}/g;

const CONFIRMATION_HINT_RE = /(?:requires?[_-]?confirmation|confirm|approval|human[_-]?in[_-]?the[_-]?loop|interruptable|interrupt|before[_-]?run|pre[_-]?invoke|dangerous\s*:\s*false|safe\s*:\s*true)/i;

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibeAgentToolNoConfirm: Rule = {
  id: 'vibe-agent-tool-no-confirm',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.65,
  title: 'Destructive agent tool registered without a confirmation gate',
  whyItMatters:
    'OWASP LLM07 ("Insecure Plugin Design") and LLM08 ("Excessive Agency"): an LLM is wired to ' +
    'a tool whose name implies a destructive, irreversible operation (delete_*, send_*, deploy_*, ' +
    'transfer_*) and the tool registration has no human-in-the-loop or confirmation step. The ' +
    'agent will eventually call it under prompt-injection. Add a confirmation hook or scope the ' +
    'tool down to non-destructive operations.',
  citation: 'https://codemore.tech/rules/vibe-agent-tool-no-confirm',

  detect(ctx: RuleContext): RuleFinding[] {
    const isPy = ctx.language === 'python';
    const findings: RuleFinding[] = [];
    const regexes = isPy ? [PY_TOOL_DECORATOR_RE, PY_TOOL_DICT_RE] : [JS_TOOL_RE, JS_NEW_TOOL_RE];
    for (const re of regexes) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const name = m[1] ?? '';
        if (!DESTRUCTIVE_VERB_RE.test(name)) continue;
        const remainder = m[2] ?? '';
        // For Python @tool decorator, check the function body & decorator
        // lines for confirmation hints. For dict/object form, check the
        // remainder of the captured object body.
        const probe = remainder || ctx.content.slice(m.index, m.index + 600);
        if (CONFIRMATION_HINT_RE.test(probe)) continue;
        const line = lineForOffset(ctx.content, m.index);
        findings.push({
          evidence: {
            file: ctx.filePath,
            line,
            column: 1,
            snippet: (ctx.lines[line - 1] ?? '').trim(),
            matchedPattern: `agent-tool-no-confirm:${name}`,
          },
          whyItMatters:
            `Tool \`${name}\` looks destructive (matches the verb allowlist) ` +
            `and the registration object has no confirmation/approval hook.`,
          suggestedFix: {
            type: 'code-patch',
            instructions:
              `Two options:\n\n` +
              `  // (a) Add a confirmation gate at registration:\n` +
              `      tools: [\n` +
              `        { name: '${name}', requires_confirmation: true, ... }\n` +
              `      ]\n\n` +
              `  // (b) Wrap the tool in a human-in-the-loop interrupt:\n` +
              `      LangGraph: interruptBefore: ['${name}']\n` +
              `      LlamaIndex: ToolApproval middleware\n\n` +
              `If the tool is not actually destructive, rename it.`,
            verificationCriteria: [
              `Tool ${name} is gated by a confirmation/approval hook OR renamed to a non-destructive name`,
              'Re-scan reports vibe-agent-tool-no-confirm resolved for this tool',
            ],
          },
        });
      }
    }
    return findings;
  },
};
