export interface Logger { debug(meta: object, msg: string): void; info(meta: object, msg: string): void; }
export function createLogger(_name: string): Logger {
  return { debug() { /* no-op */ }, info() { /* no-op */ } };
}
