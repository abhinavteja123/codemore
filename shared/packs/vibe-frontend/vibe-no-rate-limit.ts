/**
 * Rule: vibe-no-rate-limit
 *
 * Flags API route handlers in a project that ships ZERO rate-limit library
 * imports anywhere. This is the canonical Lovable / v0 / Bolt vibe-coding
 * mistake: the AI generated handlers but never wired up rate limiting, so
 * the endpoint becomes a billing or DoS magnet within hours of launch.
 *
 * Severity: MAJOR.
 *   We previously had this at BLOCKER, but every Vercel/Next.js tutorial
 *   ships routes without rate limiting (intentionally — tutorials show one
 *   thing at a time). At BLOCKER the rule lit up every reference app and
 *   degraded our "reference apps stay clean" trust signal. At MAJOR it
 *   still surfaces, but doesn't gate `--fail-on BLOCKER`. Apps that want
 *   it gating CI can promote it via `.codemorerc.json`:
 *     { "rules": { "vibe-no-rate-limit": "BLOCKER" } }
 *
 * Why this is project-level, not file-level:
 *   The signal is "the project has routes BUT no rate-limit lib anywhere."
 *   A file-only rule can't see the import graph and would either spam every
 *   file or miss the cross-file fact entirely. We rely on ProjectIndex,
 *   built once per scan.
 *
 * Mechanism:
 *   1. ProjectIndex.hasRateLimitLib is false (no @upstash/ratelimit,
 *      express-rate-limit, next-rate-limit, @nestjs/throttler, fastify-
 *      rate-limit, rate-limiter-flexible, or limiter anywhere in the
 *      project's import set).
 *   2. The CURRENT file is one of ProjectIndex.routeFiles — i.e. matches
 *      `app/api/.../route.ts(x)` (Next.js App Router) OR
 *      `pages/api/...` (Next.js Pages Router) OR imports `express` and
 *      calls `app.get/post/...`.
 *   3. Emit one finding per route file at line 1.
 *
 * Coverage gap (intentional):
 *   - Per-route fine-grained checks ("this specific POST handler doesn't
 *     wrap the body in `limit(req)`") need taint-style analysis. Out of
 *     scope for v1 — the false-negative there is acceptable; the false
 *     positive of "project has no rate limit at all" is the headline.
 *   - tRPC / GraphQL routers are not detected as routes in v1.
 *   - Self-hosted gateway / Cloudflare WAF rate limits are not detected;
 *     suppress this rule with a reason if that's your setup.
 */

import type { Rule, RuleContext, RuleFinding } from '../../rules/Rule';

const STYLE_LABEL: Record<string, string> = {
  'next-app-router':  'Next.js App Router handler',
  'next-pages-api':   'Next.js Pages API handler',
  'express':          'Express route handler',
  'unknown':          'API route handler',
};

export const vibeNoRateLimit: Rule = {
  id: 'vibe-no-rate-limit',
  version: '1.0.0',
  pack: 'vibe-frontend',
  lifecycle: 'beta',
  languages: ['typescript', 'javascript'],
  category: 'security',
  defaultSeverity: 'MAJOR',
  defaultConfidence: 0.85,
  title: 'API route ships with no rate-limit library anywhere in the project',
  whyItMatters:
    'A public API endpoint with no rate limit is the most reliable footgun in vibe-coded apps: ' +
    'one curl loop can drain your Vercel quota, empty your OpenAI credits, or DoS your database. ' +
    'Vibe-coded apps almost never wire up rate limiting because the AI generates the handler ' +
    'and stops. The fix is one import and one wrapper call — but it has to happen BEFORE the ' +
    'endpoint goes live. This rule fires when the project has at least one detected API route ' +
    'AND zero rate-limit libraries in its dependency tree.',
  citation: 'https://codemore.dev/rules/vibe-no-rate-limit',

  detect(ctx: RuleContext): RuleFinding[] {
    const idx = ctx.projectIndex;
    if (!idx) return [];                          // can't reason without project-level signal
    if (idx.hasRateLimitLib) return [];           // some rate-limit lib is present somewhere

    const me = idx.routeFiles.find(r => r.relPath === ctx.filePath);
    if (!me) return [];                           // not a route file

    const styleLabel = STYLE_LABEL[me.style] ?? STYLE_LABEL.unknown;
    const methodsLabel = me.methods.length === 0 || me.methods[0] === 'UNKNOWN'
      ? ''
      : ` (handles ${me.methods.join(', ')})`;

    return [{
      evidence: {
        file: ctx.filePath,
        line: 1,
        column: 1,
        snippet: (ctx.lines[0] ?? '').trim(),
        matchedPattern: `no-rate-limit-${me.style}`,
      },
      whyItMatters:
        `${styleLabel}${methodsLabel}, but the project imports no rate-limit library ` +
        `(@upstash/ratelimit / express-rate-limit / next-rate-limit / @nestjs/throttler / ` +
        `fastify-rate-limit / rate-limiter-flexible / limiter). One uncapped public endpoint ` +
        `is enough to drain quota or DoS the database.`,
      suggestedFix: {
        type: 'code-patch',
        instructions:
          `Add a rate limiter and wrap the route. For Next.js App Router + Upstash:\n\n` +
          `  // 1. Install: npm i @upstash/ratelimit @upstash/redis\n` +
          `  // 2. Create lib/ratelimit.ts:\n` +
          `  //      import { Ratelimit } from '@upstash/ratelimit';\n` +
          `  //      import { Redis } from '@upstash/redis';\n` +
          `  //      export const ratelimit = new Ratelimit({\n` +
          `  //        redis: Redis.fromEnv(),\n` +
          `  //        limiter: Ratelimit.slidingWindow(10, '60 s'),\n` +
          `  //      });\n` +
          `  // 3. Wrap the route:\n` +
          `  //      const ip = req.headers.get('x-forwarded-for') ?? 'anon';\n` +
          `  //      const { success } = await ratelimit.limit(ip);\n` +
          `  //      if (!success) return new Response('Too Many Requests', { status: 429 });\n\n` +
          `For Express:\n` +
          `  // 1. npm i express-rate-limit\n` +
          `  // 2. app.use(rateLimit({ windowMs: 60_000, max: 60 }));\n\n` +
          `If you rate-limit outside the app (Cloudflare WAF, gateway), suppress with ` +
          `// codemore-ignore-next-line: vibe-no-rate-limit + a Reason comment above.`,
        verificationCriteria: [
          'package.json lists one of @upstash/ratelimit / express-rate-limit / next-rate-limit / similar',
          'The route file references the limiter (import + call) OR a parent middleware does',
          'Re-scan reports vibe-no-rate-limit resolved across the project',
        ],
      },
    }];
  },
};
