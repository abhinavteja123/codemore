// False-positive fixture for core-quality-async-without-await.
// None must fire.

// Good: actually uses await.
export async function loadUser(id: string): Promise<{ id: string }> {
  const cached = await fetch(`/api/u/${id}`).then(r => r.json());
  return cached;
}

// Good: synchronous helper, not marked async.
export function compute(x: number): number {
  return x * 2;
}

// Good: async with for await loop.
export async function consume(it: AsyncIterable<number>): Promise<number> {
  let n = 0;
  for await (const v of it) n += v;
  return n;
}

// Good: arrow with await.
export const fetchJson = async (url: string): Promise<unknown> => {
  return await (await fetch(url)).json();
};

// Good: a string literal containing "async function" must not match (sanitised).
export const NOTE = "Mark helpers `async function` only when they need await.";
