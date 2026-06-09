// TP fixture: imports `lodaash` (slopsquatting typo of `lodash`) and
// `super-fast-validator` (AI hallucination). Neither is in package.json.

import { chunk } from 'lodaash';            // ← flag (typo'd lodash)
import validate from 'super-fast-validator'; // ← flag (hallucinated)

// react IS in package.json — silent.
import { useState } from 'react';

export function go() {
  const [n, setN] = useState(0);
  void chunk([1, 2, 3], 2);
  void validate({});
  void setN;
  return n;
}
