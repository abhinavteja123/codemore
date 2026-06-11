// False-positive fixture for vibe-llm-output-to-sink.
// LLM result parsed via JSON schema then dispatched through allowlist. Rule must NOT fire.

import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ACTIONS: Record<string, () => void> = {
  greet: () => console.info('Hello'),
  time:  () => console.info(Date.now()),
};

export async function safeAct(prompt: string) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0].message.content ?? '{}';
  const parsed = JSON.parse(raw) as { action?: string };
  const handler = parsed.action && ACTIONS[parsed.action];
  if (handler) handler();
}
