// False-positive fixture for core-security-hardcoded-secret-pattern.
// None must fire.

// Good: env reads.
export const STRIPE  = process.env.STRIPE_LIVE_SECRET ?? '';
export const GITHUB  = process.env.GITHUB_PAT ?? '';
export const OPENAI  = process.env.OPENAI_API_KEY ?? '';

// Good: short placeholders (under min tail length) — not flagged.
export const PLACEHOLDER_STRIPE = 'sk_live_xxx';
export const PLACEHOLDER_GHPAT  = 'ghp_xxx';

// Good: repeating-character tails (looksLikePlaceholder filter).
export const REPEAT_PLACEHOLDER = 'sk_live_xxxxxxxxxxxxxxxxxxxx';
export const REPEAT_PLACEHOLDER_GH = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// Good: docs-style placeholders.
export const YOUR_KEY = 'sk_live_YOUR_KEY_HERE_PLACEHOLDER';
