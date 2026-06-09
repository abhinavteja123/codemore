// Centralised rate-limiter. Imports the package — the project-level
// "do we have rate limiting?" gate now returns true.
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const limiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});
