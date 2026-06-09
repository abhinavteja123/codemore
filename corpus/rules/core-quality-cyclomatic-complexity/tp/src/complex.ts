// True-positive fixture for core-quality-cyclomatic-complexity.
// The function below has 17 decision points (threshold is 15).
// MUST fire exactly once on the function declaration line.

export function tangled(input: {
  a?: number; b?: number; c?: number;
  list?: number[]; mode?: string; debug?: boolean;
}): string {
  // +1 each: 12 ifs + 1 for + 1 while + 1 catch + 1 ternary + 1 && + 1 ||
  // Base 1 → final 19+, well over the threshold of 15.
  let result = '';
  if (input.a)              result += 'a';                 // +1
  if (input.b)              result += 'b';                 // +2
  if (input.c)              result += 'c';                 // +3
  if (input.mode === 'x')   result += 'X';                 // +4
  if (input.mode === 'y')   result += 'Y';                 // +5
  if (input.mode === 'z')   result += 'Z';                 // +6
  if (input.debug)          result += '!';                 // +7

  for (const n of input.list ?? []) {                      // +8 for
    if (n > 0)              result += '+';                 // +9
    if (n < 0)              result += '-';                 // +10
    if (n === 0)            result += '0';                 // +11
  }

  let i = 0;
  while (i < 3) {                                          // +12 while
    if (i % 2 === 0)        result += '.';                 // +13
    i++;
  }

  try {
    result = result + (input.a && input.b ? 'both' : 'one'); // +14 ternary, +15 &&
  } catch (e) {                                            // +16 catch
    result = result || 'err';                              // +17 ||
  }

  return result;
}
