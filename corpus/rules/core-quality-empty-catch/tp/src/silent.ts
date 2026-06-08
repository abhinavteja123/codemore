// True-positive fixture for core-quality-empty-catch.
// Three empty catches. All MUST fire.

export async function silent1(p: Promise<unknown>): Promise<void> {
  try { await p; }
  catch (e) { }                       // hit 1: catch with binding, empty body
}

export async function silent2(p: Promise<unknown>): Promise<void> {
  try { await p; }
  catch { }                           // hit 2: catch without binding, empty body
}

export async function silent3(p: Promise<unknown>): Promise<void> {
  try { await p; } catch (e) {
    // TODO: handle this
  }                                   // hit 3: catch body is only a comment -> empty after strip
}
