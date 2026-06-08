// True-positive fixture for core-quality-async-without-await.
// Four async-without-await definitions. All MUST fire.

// 1. Function declaration.
export async function compute(x: number): Promise<number> {
  return x * 2;
}

// 2. Function expression.
export const compute2 = async function (x: number): Promise<number> {
  return x + 1;
};

// 3. Arrow with block body.
export const compute3 = async (x: number): Promise<number> => {
  return x - 1;
};

// 4. Class method shorthand.
export class Helper {
  async tag(prefix: string, value: string): Promise<string> {
    return `${prefix}:${value}`;
  }
}
