// True-positive fixture for vibe-llm-output-to-sink.
// LLM result flows through one intermediate var into eval/exec. Rule MUST fire.

import OpenAI from 'openai';

declare const exec: (cmd: string) => Promise<string>;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function dangerouslyExecute(prompt: string) {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });
  const code = completion.choices[0].message.content ?? '';
  eval(code);
  await exec(code);
}
