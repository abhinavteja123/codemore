/**
 * Central pack registration for the CLI.
 *
 * All rule packs must be imported and registered here so that CLI scans
 * (and, by extension, the MCP server once it lands) see them. The registry
 * is a singleton, so registration is idempotent and guarded by a flag.
 *
 * Adding a new pack:
 *   1. Import its `registerInto` helper from `shared/packs/<pack>/index.ts`.
 *   2. Call it from `registerAllPacks()` below.
 */

import { globalRegistry } from '../../shared/rules/registry';
import { registerInto as registerVibeSupabase } from '../../shared/packs/vibe-supabase';
import { registerInto as registerVibeSecrets } from '../../shared/packs/vibe-secrets';
import { registerInto as registerVibeFrontend } from '../../shared/packs/vibe-frontend';
import { registerInto as registerVibeAuth } from '../../shared/packs/vibe-auth';
import { registerInto as registerCoreSecurity } from '../../shared/packs/core-security';
import { registerInto as registerCoreQuality } from '../../shared/packs/core-quality';

let registered = false;

export function registerAllPacks(): void {
  if (registered) return;

  const bind = globalRegistry.registerPack.bind(globalRegistry);
  registerVibeSupabase(bind);
  registerVibeSecrets(bind);
  registerVibeFrontend(bind);
  registerVibeAuth(bind);
  registerCoreSecurity(bind);
  registerCoreQuality(bind);

  registered = true;
}
