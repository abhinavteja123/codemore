// Stub for the FP fixture.
export interface Logger { warn(meta: object, msg: string): void; debug(meta: object, msg: string): void; }
export function createLogger(_name: string): Logger {
  return { warn() { /* no-op */ }, debug() { /* no-op */ } };
}
