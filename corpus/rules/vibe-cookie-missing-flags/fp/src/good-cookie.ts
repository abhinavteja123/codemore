// False-positive fixture for vibe-cookie-missing-flags.
// All three flags set; rule must NOT fire.

import session from 'express-session';

export const sessionMiddleware = session({
  secret: 'placeholder',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  },
});

export function setSafeCookie(res: { cookie: (n: string, v: string, o: object) => void }, value: string) {
  res.cookie('token', value, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
}
