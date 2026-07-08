/**
 * Rule: vibe-llm-output-to-sink
 *
 * Detects an LLM client response (OpenAI / Anthropic / LangChain / etc.)
 * being passed into an execution sink — eval / exec / Function / shell /
 * SQL template — without an intervening parser or schema validator.
 *
 * This is OWASP LLM02 "Insecure Output Handling" in practice. The agent
 * trusts the model output as if it were code the developer wrote. Two
 * variants:
 *
 *   1. Direct: the variable bound to the LLM call IS passed to a sink
 *      within the same function body, possibly after a single transform.
 *   2. Chained: the LLM output is interpolated into a template literal
 *      that is then passed to a sink.
 *
 * Confirm pass: we walk the file looking for both halves. If both halves
 * exist AND we can connect them by variable name, we fire.
 *
 * Severity: BLOCKER. The exploit is a prompt-injection chain — the
 * attacker controls the LLM via a public input, the LLM emits code, the
 * code lands in eval.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

// LLM call-site patterns. Capture the assignment target so we can track it.
const LLM_CALL_RES: ReadonlyArray<RegExp> = [
  // openai v4 SDK: const x = await client.chat.completions.create({...})
  /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*?(?:openai|client|llm)[\w.]*\.(?:chat\.completions|completions|responses)\.create\s*\(/g,
  // anthropic SDK: const x = await client.messages.create({...})
  /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*?(?:anthropic|client|llm)[\w.]*\.messages\.create\s*\(/g,
  // langchain: const x = await chain.invoke / chain.run / agent.run
  /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[\w.]*?(?:chain|agent|llm)\.(?:invoke|run|call|stream)\s*\(/g,
  // Python: x = openai.chat.completions.create(...)
  /^\s*(\w+)\s*=\s*(?:await\s+)?[\w.]*?(?:openai|anthropic|client|llm|chain|agent)\.[\w.]*(?:create|invoke|run|call)\s*\(/gm,
];

// Sink patterns. Each captures the SINK argument so we can probe for the
// LLM variable name inside it.
const SINK_RES: ReadonlyArray<{ re: RegExp; sink: string }> = [
  { re: /\beval\s*\(([^)]+)\)/g, sink: 'eval' },
  { re: /\bnew\s+Function\s*\(([^)]+)\)/g, sink: 'new Function' },
  { re: /\bexec\s*\(([^)]+)\)/g, sink: 'exec' },
  { re: /\bos\.system\s*\(([^)]+)\)/g, sink: 'os.system' },
  { re: /\bsubprocess\.(?:run|Popen|call)\s*\(([^)]+)\)/g, sink: 'subprocess' },
  // Template literal feeding a query / execute call.
  { re: /\b(?:db|conn|cursor)\.(?:query|execute|raw)\s*\(\s*`([^`]+)`/g, sink: 'sql-template' },
];

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

export const vibeLlmOutputToSink: Rule = {
  id: 'vibe-llm-output-to-sink',
  version: '1.1.0',
  pack: 'core-security',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript', 'python'],
  category: 'security',
  defaultSeverity: 'BLOCKER',
  defaultConfidence: 0.75,
  title: 'LLM output flows into eval / exec / shell / SQL template',
  whyItMatters:
    'OWASP LLM02 ("Insecure Output Handling") in concrete form: the model returns a string and ' +
    'the application executes it. Because the model is itself an attacker-influencable channel ' +
    '(prompt injection via user input, training-data poisoning, or a malicious tool result), ' +
    'this is a remote-code-execution primitive even without classical injection. The defence is ' +
    'to treat LLM output as untrusted text — parse via JSON.parse / schema validator, never pass ' +
    'directly to eval / exec / spawn / SQL template.',
  citation: 'https://codemore.tech/rules/vibe-llm-output-to-sink',

  detect(ctx: RuleContext): RuleFinding[] {
    const findings: RuleFinding[] = [];

    // Collect every LLM call-site assignment.
    const llmTargets = new Map<string, number>(); // name -> source offset
    for (const re of LLM_CALL_RES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const name = m[1];
        if (name && !llmTargets.has(name)) llmTargets.set(name, m.index);
      }
    }
    if (llmTargets.size === 0) return findings;

    // One level of taint propagation: if `const|let|var X = <something
    // containing an LLM-bound name>`, treat X as LLM-tainted too. This
    // catches the common pattern of `const code = completion.choices[0]
    // .message.content`. Bounded at depth=2 to avoid runaway re-tagging.
    for (let depth = 0; depth < 2; depth++) {
      const newTargets: string[] = [];
      const assignRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)/g;
      let m: RegExpExecArray | null;
      while ((m = assignRe.exec(ctx.content)) !== null) {
        const target = m[1];
        const expr = m[2] ?? '';
        if (!target || llmTargets.has(target)) continue;
        for (const llm of llmTargets.keys()) {
          if (new RegExp(`\\b${llm}\\b`).test(expr)) {
            newTargets.push(target);
            break;
          }
        }
      }
      // Python-style assignment (no const/let/var).
      const pyAssignRe = /^\s*(\w+)\s*=\s*([^\n]+)/gm;
      while ((m = pyAssignRe.exec(ctx.content)) !== null) {
        const target = m[1];
        const expr = m[2] ?? '';
        if (!target || llmTargets.has(target)) continue;
        for (const llm of llmTargets.keys()) {
          if (new RegExp(`\\b${llm}\\b`).test(expr)) {
            newTargets.push(target);
            break;
          }
        }
      }
      if (newTargets.length === 0) break;
      for (const t of newTargets) llmTargets.set(t, -1);
    }

    // For each sink, check whether the captured argument contains any
    // LLM-target identifier. We use a word-boundary check rather than
    // full dataflow — false positives are filtered by the suppress
    // directive, false negatives would silently miss CVEs.
    for (const { re, sink } of SINK_RES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(ctx.content)) !== null) {
        const arg = m[1] ?? '';
        for (const name of llmTargets.keys()) {
          const idRe = new RegExp(`\\b${name}\\b`);
          if (!idRe.test(arg)) continue;
          const line = lineForOffset(ctx.content, m.index);
          findings.push({
            evidence: {
              file: ctx.filePath,
              line,
              column: 1,
              snippet: (ctx.lines[line - 1] ?? '').trim(),
              matchedPattern: `llm-output-to-${sink}`,
            },
            whyItMatters:
              `LLM-bound variable \`${name}\` flows into a \`${sink}\` sink. ` +
              `The model output is attacker-controllable via prompt injection.`,
            suggestedFix: {
              type: 'code-patch',
              instructions:
                `Parse the LLM output via a schema validator before consuming it:\n\n` +
                `  // 1. Force structured output from the model (tool / JSON mode).\n` +
                `  // 2. JSON.parse + Zod / pydantic schema check.\n` +
                `  // 3. Whitelist the action you take on the parsed object.\n\n` +
                `Never pass model output to eval / exec / spawn / SQL template directly.`,
              verificationCriteria: [
                'LLM output is parsed and schema-validated before use',
                'No code path passes the raw response string to eval / exec / Function / spawn / SQL',
                'Re-scan reports vibe-llm-output-to-sink resolved for this line',
              ],
            },
          });
          break; // one finding per sink instance is enough
        }
      }
    }
    return findings;
  },
};
