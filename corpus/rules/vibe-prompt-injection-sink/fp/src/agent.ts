// FP fixture: safe patterns. Rule must NOT fire.

declare const openai: {
  chat: { completions: { create: (a: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } };
};
declare const db: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
declare function exec(cmd: string, cb?: (e: Error | null) => void): void;
declare function execFile(file: string, args: string[]): void;

// (a) Constant inputs to sinks — safe.
export function constantEval() {
  eval('1 + 1');                                                 // static
  exec('git status');                                            // static
}

// (b) LLM output JSON-parsed and dispatched via a finite table — safe.
//     (Our v1 rule deliberately doesn't track the parse boundary, so the
//     value flowing into the sink is no longer recognised as LLM-tainted.)
export async function safeAgent() {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  const parsed = JSON.parse(response.choices[0].message.content) as { action: 'ping' | 'pong' };
  const ACTIONS = { ping: () => 'pong', pong: () => 'ping' };
  const fn = ACTIONS[parsed.action];
  if (fn) fn();
}

// (c) Parameterised SQL — model output flows through the params slot,
//     not the SQL string. The SQL template has no LLM-tainted substitution.
export async function safeQuery() {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  const id = response.choices[0].message.content;
  await db.query('SELECT * FROM items WHERE id = $1', [id]);     // safe — id goes through params
}

// (d) execFile with argv array — argv elements are not joined into a shell
//     string. (Even if `rev` is LLM-tainted, this isn't a shell-injection
//     sink in the same way; our rule already only inspects argument[0].)
export async function safeExec(rev: string) {
  execFile('git', ['log', '--oneline', rev]);
}
