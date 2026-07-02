# vibe-cookie-missing-flags

**Pack:** `vibe-frontend`
**Default severity:** MAJOR
**Languages:** TypeScript, JavaScript
**Lifecycle:** beta
**Confidence:** 0.8

## What it catches

Session middleware / cookie config that's missing `httpOnly: true`, `secure: true`, or `sameSite: 'lax'|'strict'`. AI-generated auth code routinely uses a session library with default options that turn ALL three of these off.

Recognises patterns:

- `express-session` — `session({ ... })`
- `iron-session` — `sealData` / Iron config / `getIronSession(req, res, { cookieOptions: {...} })`
- `cookie-session` — `cookieSession({ ... })`
- `next-auth` (v4+) — `cookies: { sessionToken: { options: { ... } } }` in NextAuth config
- Direct cookie setting — `res.cookie('name', val, { ... })`

For each session/cookie config, checks whether all three flags are present:

- `httpOnly: true` ← prevents XSS-to-session-token
- `secure: true` ← prevents HTTP downgrade sniff
- `sameSite: 'lax'|'strict'` ← prevents CSRF

## Why this matters for vibe-coded apps

Default session cookies in express-session, iron-session, cookie-session, and Next.js are sent over HTTP without `httpOnly` + `secure` + `sameSite` unless the config explicitly sets each. AI-generated apps almost never bother. Result:

- **Missing `httpOnly`:** Any XSS in the app becomes a session-token exfiltration.
- **Missing `secure`:** Any HTTP fallback (dev misconfiguration, MITM) becomes a session-token sniff.
- **Missing `sameSite`:** Any third-party POST becomes a Cross-Site Request Forgery (CSRF).

This is the #1 session-handling flaw in vibe-coded apps.

## Example — flagged

```ts
// express-session with defaults (all three flags missing).
app.use(
  session({
    secret: 'your-secret-here',
    resave: false,
    saveUninitialized: true,
    // MAJOR: missing httpOnly, secure, sameSite
  })
);
```

```ts
// iron-session without secure flags.
import { getIronSession } from 'iron-session';

export async function GET(req: NextRequest, res: NextResponse) {
  // MAJOR: no cookieOptions with security flags.
  const session = await getIronSession(req, res, {
    cookieName: 'auth',
    password: 'complex_password_at_least_32_chars_long',
  });
  return res.json(session);
}
```

```ts
// next-auth without full cookie config.
export const authConfig = {
  providers: [...],
  cookies: {
    sessionToken: {
      // MAJOR: options object missing httpOnly, secure, sameSite.
      options: {
        path: '/',
        httpOnly: false,  // WRONG
      },
    },
  },
};
```

## Example — not flagged

```ts
// express-session with all flags.
app.use(
  session({
    secret: 'your-secret-here',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,     // ← OK: prevents XSS
      secure: process.env.NODE_ENV === 'production',  // ← OK: enables HTTPS only
      sameSite: 'lax',    // ← OK: prevents CSRF
    },
  })
);
```

```ts
// iron-session with secure options.
const session = await getIronSession(req, res, {
  cookieName: 'auth',
  password: 'complex_password_at_least_32_chars_long',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
```

```ts
// next-auth with full security config.
export const authConfig = {
  providers: [...],
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  },
};
```

## Suggested fix

Add the missing flags to the cookie options object:

**express-session:**

```ts
app.use(
  session({
    secret: 'your-secret-here',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,                                    // Prevent XSS
      secure: process.env.NODE_ENV === 'production',   // HTTPS only (dev exception)
      sameSite: 'lax',                                   // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,                      // 24 hours
    },
  })
);
```

**iron-session:**

```ts
const session = await getIronSession(req, res, {
  cookieName: 'auth',
  password: process.env.SECRET_KEY,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
```

**next-auth:**

```ts
export const authConfig = {
  providers: [...],
  callbacks: {...},
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  },
};
```

**Direct cookie setting:**

```ts
res.cookie('sessionId', sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
});
```

## Suppressing

```ts
// Reason: this is a non-sensitive tracking cookie, not a session token.
// codemore-ignore-next-line: vibe-cookie-missing-flags
res.cookie('analytics_id', uuid(), {
  maxAge: 365 * 24 * 60 * 60 * 1000,  // 1 year
});
```

The directive must be on the line **immediately before** the target. If you put a comment between them, the directive suppresses the comment instead.

## References

- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN — Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [express-session](https://github.com/expressjs/session)
- [iron-session](https://github.com/vvo/iron-session)

## Implementation

Regex scan for session middleware / cookie config patterns. For each match, extracts the options object body and checks for the presence of `httpOnly: true`, `secure: true` (or a NODE_ENV conditional), and `sameSite: 'lax'|'strict'`. Missing flags are reported with a count of what's missing.

Source: [`shared/packs/vibe-frontend/vibe-cookie-missing-flags.ts`](../../shared/packs/vibe-frontend/vibe-cookie-missing-flags.ts)
Fixtures: [`corpus/rules/vibe-cookie-missing-flags/`](../../corpus/rules/vibe-cookie-missing-flags/)
