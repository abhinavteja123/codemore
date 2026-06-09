# vibe-prompt-injection-sink

**Pack:** `core-security`
**Default severity:** BLOCKER
**Languages:** TypeScript, JavaScript
**Lifecycle:** experimental
**Confidence:** 0.8

## What it catches

LLM responses flowing into a code-execution or SQL sink. Sinks recognised:

- `eval(...)`, `new Function(...)`.
- `child_process.exec / execSync / execFile / execFileSync / spawn / spawnSync` (bare or as `cp.exec`, `process.exec`, etc.).
- `sql\`…${x}…\`` tagged templates.
- `.query / .execute / .unsafe / .raw` calls with a template literal argument containing substitutions.

Taint sources (the LLM-output side):

- Property chains that include `choices`, `message`, `completion`, `completions`, `generations`, `response`, `output`, `text`, `content`.
- Identifiers whose names match `/^(?:llm|ai|model|assistant|completion|gen|chat).*(?:Response|Result|Text|Content|Message|Output)$/i`.
- One-hop assignments from a recognised LLM call: `openai.chat.completions.create`, `openai.completions.create`, `anthropic.messages.create`, `model.generateContent`, `generativeModel.generateContent`, `gemini.generateContent`, `chat.create`.

## Why this matters for vibe-coded apps

Agentic apps multiplied in 2025–2026. The shortest path from "the agent works" to "the agent ran `rm -rf /`" is to feed LLM output into a sink that interprets it: `eval`, `Function`, `exec`, a SQL template. Attackers control the prompt indirectly through RAG sources, tool outputs, scraped pages, or chat messages, and produce strings that the sink executes verbatim.

This is the same class as SQL injection / RCE — just with a fresh delivery channel that audits rarely look for.

## Example — flagged

```ts
const response = await openai.chat.completions.create({ ... });
eval(response.choices[0].message.content);                       // chain via .choices.message.content

const code = response.choices[0].message.content;
eval(code);                                                      // one-hop taint

exec(response.choices[0].message.content);                       // shell sink

const id = response.choices[0].message.content;
await db.query(`SELECT * FROM items WHERE id = '${id}'`);        // template-literal SQL sink
```

## Example — not flagged

```ts
// Constant inputs.
eval('1 + 1');
exec('git status');

// JSON-parsed + finite dispatch table — taint stops at the parse boundary.
const parsed = JSON.parse(response.choices[0].message.content) as { action: 'ping' | 'pong' };
const fn = { ping: doPing, pong: doPong }[parsed.action];
if (fn) fn();

// Parameterised SQL — model output goes into the params slot.
await db.query('SELECT * FROM items WHERE id = $1', [id]);

// argv array shell call.
execFile('git', ['log', '--oneline', rev]);
```

## Suggested fix

- **Code execution**: parse the LLM output into a structured shape, then dispatch via a finite table of known functions. Never pass the raw string to `eval` / `new Function` / `exec`.
- **SQL**: use parameter binding. Never interpolate model output into a template literal SQL.
- **Shell**: use `execFile` / `spawn` with an argv array. Each element is a separate process argument.
- **Tool-calling**: define a JSON schema for function-call arguments at the LLM-tool level AND validate the arguments at the receiving code.

## Suppressing

```ts
// Reason: parsed.action is constrained to a 4-element enum via the function-call schema
// AND validated by Zod before reaching this dispatch.
// codemore-ignore-next-line: vibe-prompt-injection-sink
const fn = ACTIONS[parsed.action];
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Per-function AST walk. The rule builds a small in-function taint map by recognising `const X = await <llm-call>(...)`, `const X = response.choices[0].message.content`, and `const { content } = <llm-shape>` patterns. It then visits every recognised sink (`eval` / `new Function` / `child_process.*` / `sql\`...\`` / `.query(<template>)`) and classifies the first argument or any template substitution.

Coverage gap:
- Multi-hop taint (`a = x.content; b = a; eval(b)`) — only one hop tracked.
- Taint dies at JSON-parse — by design; v1 cannot reason through structured parse boundaries safely.
- Sanitiser wrappers not recognised in v1; suppress with a Reason comment.

Source: [`shared/packs/core-security/vibe-prompt-injection-sink.ts`](../../shared/packs/core-security/vibe-prompt-injection-sink.ts)
Fixtures: [`corpus/rules/vibe-prompt-injection-sink/`](../../corpus/rules/vibe-prompt-injection-sink/)
