// True-positive fixture for core-typescript-non-null-assertion-abuse.
// Four non-null assertions. All four MUST fire.

interface User { profile?: { email?: string } }

export function leak(u: User | undefined): string {
  return u!.profile!.email!;     // 3 hits: u!, profile!, email!
}

export function index(arr: string[] | undefined): string {
  return arr![0];                // 1 hit
}
