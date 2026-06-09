// TP fixture: LLM output flowing into dangerous sinks.

declare const openai: {
  chat: { completions: { create: (a: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } };
};
declare const db: { query: (sql: string) => Promise<unknown> };
declare function exec(cmd: string, cb?: (e: Error | null) => void): void;

export async function runAgent_a(prompt: string) {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  // eval directly on the LLM message content via chain.
  eval(response.choices[0].message.content);                     // ← flag (chain:choices)
}

export async function runAgent_b() {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  const code = response.choices[0].message.content;
  eval(code);                                                    // ← flag (chain via taint)
}

export async function runAgent_c() {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  const cmd = response.choices[0].message.content;
  exec(cmd);                                                     // ← flag (exec from taint)
}

export async function runAgent_d() {
  const response = await openai.chat.completions.create({ model: 'gpt-4', messages: [] });
  const id = response.choices[0].message.content;
  // Template-literal SQL with LLM-tainted interpolation.
  await db.query(`SELECT * FROM items WHERE id = '${id}'`);      // ← flag (query-template)
}
