// FP fixture: everything declared OR a builtin / relative.

import { useState } from 'react';            // declared
import { chunk } from 'lodash';              // declared (correct spelling)
import { writeFileSync } from 'node:fs';     // node builtin
import { join } from 'path';                 // node builtin (no node: prefix)
import { helper } from './helper';           // relative
import type * as ts from 'typescript';       // devDep, declared

export function go() {
  const [n, setN] = useState(0);
  void chunk([1, 2, 3], 2);
  void writeFileSync;
  void join;
  void helper;
  void setN;
  const x: ts.Node | undefined = undefined;
  void x;
  return n;
}
