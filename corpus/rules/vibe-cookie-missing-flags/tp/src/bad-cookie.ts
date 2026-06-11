// True-positive fixture for vibe-cookie-missing-flags.
// Session middleware with no cookie options at all — all three flags missing.

import session from 'express-session';

export const sessionMiddleware = session({
  secret: 'placeholder',
  resave: false,
  saveUninitialized: false,
});

// Inline res.cookie missing httpOnly + secure + sameSite.
export function setBareCookie(res: { cookie: (n: string, v: string, o: object) => void }, value: string) {
  res.cookie('token', value, { path: '/' });
}
