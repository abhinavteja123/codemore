// True-positive fixture for core-quality-unused-import.
// Each import binding below is declared and never referenced.
// All should be flagged.

// `useState` is imported but never called.
import { useState } from 'react';                 // ← flag (named)

// Default import never referenced.
import lodash from 'lodash';                      // ← flag (default)

// Namespace import never referenced.
import * as helpers from './helpers';             // ← flag (namespace)

// One of two named imports is used, one is not.
import { partial, unused } from './partial';      // ← flag `unused` only
export function take(): unknown {
  return partial();
}

export function noop(): void {
  // No use of useState / lodash / helpers anywhere.
}
