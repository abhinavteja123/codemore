# vibe-llm-output-to-sink

**Pack:** `core-security`
**Default severity:** BLOCKER
**Languages:** TypeScript, JavaScript, Python
**Lifecycle:** beta
**Confidence:** 0.75

## What it catches

An LLM client response (OpenAI / Anthropic / LangChain / etc.) flowing into an execution sink — `eval()` / `exec()` / `Function()` / shell spawning / SQL template — without an intervening parser or schema validator.

This is OWASP LLM02 "Insecure Output Handling" in practice. The application trusts the model output as if it were code the developer wrote. Two patterns:

1. **Direct:** the variable bound to the LLM call is passed to a sink within the same function body.
2. **Chained:** the LLM output is transformed (e.g., `completion.choices[0].message.content`) and then passed to a sink.

## Why this matters for vibe-coded apps

An LLM is an attacker-influencable channel:

- **Prompt injection** — a user's input is concatenated into a system/user prompt.
- **Training-data poisoning** — a malicious document or web scrape corrupts the model's weights.
- **Tool result poisoning** — a compromised external API or tool returns attacker-controlled text.

If the model's output lands in `eval()`, the attacker has code execution. If it lands in an SQL template, the attacker has a database write. This is the most dangerous single vulnerability in agent-based systems.

## Example — flagged

```ts
import OpenAI from 'openai';

const client = new OpenAI();

async function runUserCode(userRequest: string) {
  // User input → prompt → LLM.
  const completion = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: userRequest },
    ],
  });

  // BLOCKER: LLM output flows directly into eval.
  const code = completion.choices[0].message.content;
  const result = eval(code);  // Attacker controls code via prompt injection.
  return result;
}

async function queryDatabase(userInput: string) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'Generate a SQL query.' },
      { role: 'user', content: userInput },
    ],
  });

  const query = completion.choices[0].message.content;
  
  // BLOCKER: SQL template with LLM output — injection.
  const result = await db.query(`
    SELECT * FROM users WHERE email = '${query}'
  `);
  return result;
}
```

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function executeAction(userRequest: string) {
  const message = await client.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: userRequest },
    ],
  });

  const actionCode = message.content[0].type === 'text' ? message.content[0].text : '';
  
  // BLOCKER: Anthropic output flows into Function.
  const fn = new Function(actionCode);
  fn();  // Attacker controls the function body.
}
```

```py
import subprocess
from openai import OpenAI

client = OpenAI()

def run_command(user_request: str):
    # BLOCKER: LLM output goes into subprocess.
    completion = client.chat.completions.create(
        model='gpt-4',
        messages=[
            { 'role': 'user', 'content': user_request },
        ],
    )
    command = completion.choices[0].message.content
    result = subprocess.run(command, shell=True, capture_output=True)  # Code execution.
    return result.stdout
```

## Example — not flagged

```ts
import OpenAI from 'openai';
import { z } from 'zod';

const client = new OpenAI();

// OK: Define a schema for the expected output.
const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'escalate']),
  reason: z.string(),
});

async function processRequest(userRequest: string) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: userRequest },
    ],
    // Force JSON mode to ensure structured output.
    response_format: { type: 'json_object' },
  });

  const output = completion.choices[0].message.content || '{}';
  
  // Parse and validate the JSON against the schema.
  const parsed = JSON.parse(output);
  const validated = actionSchema.parse(parsed);  // Zod validates the structure.
  
  // Safe to use: validated.action is one of ['approve', 'reject', 'escalate'].
  if (validated.action === 'approve') {
    // Proceed with a safe action.
  }
}
```

```py
import json
from pydantic import BaseModel, ValidationError
from openai import OpenAI

client = OpenAI()

class Action(BaseModel):
    action: str  # Will be validated
    reason: str

def process_request(user_request: str):
    # OK: Request structured output from the model.
    completion = client.chat.completions.create(
        model='gpt-4',
        messages=[
            {
                'role': 'user',
                'content': user_request,
            },
        ],
        # Force JSON response.
    )
    
    output = completion.choices[0].message.content or '{}'
    
    # Parse and validate with Pydantic.
    try:
        parsed = json.loads(output)
        action = Action(**parsed)  # Pydantic validates.
        
        # Safe: action.action is a string, validated against the schema.
        if action.action in ['approve', 'reject']:
            proceed_with_action(action.action)
    except (json.JSONDecodeError, ValidationError) as e:
        log_error(f"Invalid LLM output: {e}")
        return "Error processing request"
```

## Suggested fix

**Step 1: Force structured output from the model**

Most LLM APIs support JSON mode or tool/function calling:

```ts
// OpenAI: JSON mode
const completion = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  response_format: { type: 'json_object' },  // ← Force JSON
});

// Anthropic: tool use
const message = await client.messages.create({
  model: 'claude-3-opus-20240229',
  tools: [
    {
      name: 'approve_request',
      description: 'Approve the user request',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  ],
  messages: [...],
});
```

**Step 2: Parse and validate the output**

```ts
import { z } from 'zod';

const schema = z.object({
  action: z.enum(['approve', 'reject', 'escalate']),
  reason: z.string().max(500),
});

const output = completion.choices[0].message.content || '{}';
const parsed = JSON.parse(output);
const validated = schema.parse(parsed);  // Throws if invalid.

// Now validated.action is guaranteed to be one of the enum values.
```

**Step 3: Whitelist the actions you allow**

```ts
const ALLOWED_ACTIONS = new Set(['approve', 'reject']);

if (!ALLOWED_ACTIONS.has(validated.action)) {
  throw new Error(`Action '${validated.action}' is not allowed`);
}

// Proceed safely.
executeAction(validated.action);
```

## Suppressing

```ts
// Reason: we parse the output through a TypeScript compiler API validator,
// then only allow specific AST node types. Full dataflow verification is redundant.
// codemore-ignore-next-line: vibe-llm-output-to-sink
const ast = ts.parseSourceFileText(modelOutput);
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP LLM02: Insecure Output Handling](https://owasp.org/www-project-top-10-for-large-language-model-applications/2024/01/02-insecure-output-handling)
- [OpenAI: Using JSON mode](https://platform.openai.com/docs/guides/structured-outputs/json-mode)
- [Anthropic: Tool use](https://docs.anthropic.com/en/docs/build-a-claude-app/tool-use)
- [Zod: TypeScript-first schema validation](https://zod.dev/)

## Implementation

Per-file identifier taint tracking. Walks the file collecting every LLM call-site assignment (`const x = await client.chat.completions.create(...)`). Then traces taint propagation through one level of assignment (`const y = x.choices[0].message.content`). For each sink (`eval`, `Function`, `exec`, `subprocess`, SQL template), checks whether the captured argument contains any tainted variable. Flags if yes.

Source: [`shared/packs/core-security/vibe-llm-output-to-sink.ts`](../../shared/packs/core-security/vibe-llm-output-to-sink.ts)
Fixtures: [`corpus/rules/vibe-llm-output-to-sink/`](../../corpus/rules/vibe-llm-output-to-sink/)
