# vibe-agent-tool-no-confirm

**Pack:** `core-security`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript, Python
**Lifecycle:** beta
**Confidence:** 0.65

## What it catches

An agent tool function with a destructive verb in its name (delete_*, drop_*, send_*, deploy_*, exec_*, run_*, charge_*, transfer_*, rm_*, etc.) that is registered with an LLM SDK without an explicit confirmation gate.

Specifically:

- OpenAI function-calling tools: `tools = [{ type: 'function', function: { name: 'delete_database', ... } }]` with no `requires_confirmation` flag
- Anthropic tool-use: `tools = [{ name: 'send_email', ... }]` without confirmation metadata
- LangChain Tool: `new Tool({ name: 'transfer_funds', ... })` or `tool({ name: 'drop_table', ... })` without approval hooks
- LangGraph: tools registered without `interruptBefore` / `interruptAfter`
- `@tool` decorator in Python over a destructive function

The rule looks for confirmation hints like `requires_confirmation`, `confirm`, `approval`, `human_in_the_loop`, `interruptable`, or `before_run` / `pre_invoke` hooks anywhere in the tool definition.

## Why this matters for vibe-coded apps

OWASP LLM07 ("Insecure Plugin Design") and LLM08 ("Excessive Agency"): AI-generated code wires LLMs to powerful tools without guardrails. An LLM is inherently an attacker-influencable channel — via prompt injection, training-data poisoning, or a malicious tool result. If the LLM is wired to a tool named `delete_*`, `send_*`, or `deploy_*` and the tool registration has no human-in-the-loop, the agent will eventually call it under prompt-injection attack.

This is especially critical for:

- Financial tools (transfer_funds, charge_credit_card)
- Infrastructure tools (deploy_*, delete_database)
- Communication tools (send_email, send_slack_message)

## Example — flagged

```ts
// OpenAI function-calling without confirmation.
const tools = [
  {
    type: 'function',
    function: {
      name: 'delete_database',  // ← destructive verb
      description: 'Permanently delete the entire database.',
      parameters: { /* ... */ },
    },
  },
];

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages,
  tools,  // ← MAJOR: no confirmation gate
});
```

```ts
// LangChain Tool without approval.
const deleteTool = new Tool({
  name: 'delete_user_account',  // ← destructive verb
  func: async (userId: string) => {
    // Delete the user's account.
  },
});

const agent = await initializeAgentExecutorWithOptions(
  [deleteTool],
  llm,
  // ← MAJOR: no interruptBefore / approval middleware
);
```

```py
# Python @tool decorator without confirmation.
@tool
def transfer_funds(amount: float, recipient: str) -> str:
    """Transfer funds from the account."""
    # Performs the transfer.
    return f"Transferred {amount} to {recipient}"

# Tool is registered with the agent without a confirmation hook.
tools = [transfer_funds]
agent = AgentExecutor.from_agent_and_tools(agent, tools)
```

## Example — not flagged

```ts
// OpenAI with requires_confirmation flag.
const tools = [
  {
    type: 'function',
    function: {
      name: 'delete_database',
      requires_confirmation: true,  // ← OK: explicit confirmation
      parameters: { /* ... */ },
    },
  },
];
```

```ts
// LangGraph with interruptBefore.
const workflow = new StateGraph(AgentState)
  .addNode('agent', agent)
  .addEdge('agent', 'tools');

const executor = workflow.compile({
  interruptBefore: ['delete_database', 'send_email'],  // ← OK: approval gate
});
```

```py
# Tool with a human-in-the-loop check.
@tool
def delete_database() -> str:
    """Permanently delete the database."""
    if not request_human_approval("Really delete the database?"):
        return "Cancelled by human."
    # Perform deletion.
    return "Database deleted."
```

## Suggested fix

**Option 1: Add a confirmation gate at tool registration**

```ts
// OpenAI
const tools = [
  {
    type: 'function',
    function: {
      name: 'delete_database',
      requires_confirmation: true,  // ← explicit flag
      parameters: { /* ... */ },
    },
  },
];
```

```ts
// Anthropic
const tools = [
  {
    name: 'send_email',
    requires_confirmation: true,  // ← explicit flag
    // ...
  },
];
```

**Option 2: Use LangGraph interruptBefore**

```ts
const executor = workflow.compile({
  interruptBefore: ['delete_database', 'send_email', 'deploy_service'],
});
```

**Option 3: Wrap the tool in a human-in-the-loop middleware**

```py
class ApprovalMiddleware:
    def before_invoke(self, tool_name: str, args: dict) -> bool:
        if tool_name.startswith(('delete_', 'send_', 'deploy_')):
            return request_human_approval(f"Approve tool call: {tool_name}")
        return True

agent.add_middleware(ApprovalMiddleware())
```

**Option 4: If the tool is not actually destructive, rename it**

```ts
// Instead of delete_temp_cache, call it clear_cache_if_empty
const tools = [
  {
    type: 'function',
    function: {
      name: 'clear_cache_if_empty',  // ← non-destructive name
      parameters: { /* ... */ },
    },
  },
];
```

## Suppressing

```ts
// Reason: this tool is read-only and doesn't actually delete anything.
// codemore-ignore-next-line: vibe-agent-tool-no-confirm
const tools = [
  { type: 'function', function: { name: 'delete_old_logs', ... } },
];
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## Implementation

Per-file AST walk inside LLM SDK files. For each tool definition (OpenAI tools array, Anthropic tool-use, LangChain Tool constructor, @tool decorator), extracts the tool name. If the name matches a destructive verb allowlist and the surrounding object/function definition lacks a confirmation hint, fires at MAJOR confidence.

Source: [`shared/packs/core-security/vibe-agent-tool-no-confirm.ts`](../../shared/packs/core-security/vibe-agent-tool-no-confirm.ts)
Fixtures: [`corpus/rules/vibe-agent-tool-no-confirm/`](../../corpus/rules/vibe-agent-tool-no-confirm/)
