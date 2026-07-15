/**
 * White-box tests for shared/rules/astHelpers.ts — added from the
 * 2026-07-15 mutation baseline (test/MUTATION-BASELINE.md).
 *
 * Two survivors that mean a real bug ships silently:
 *   - PURE_SVG_RE anchor deletion: `<svg>…</svg><script>…` would classify
 *     as 'static-svg' — an XSS payload riding a benign-looking SVG gets a
 *     severity downgrade.
 *   - `complexity > threshold` → `>=`: functions AT the threshold get
 *     flagged, silently tightening the published contract.
 */

import { strict as assert } from 'assert';
import * as ts from 'typescript';
import {
  findDangerouslySetInnerHTML,
  findHighComplexityFunctions,
} from '../shared/rules/astHelpers';

function tsx(content: string): ts.SourceFile {
  return ts.createSourceFile('fixture.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function tsSrc(content: string): ts.SourceFile {
  return ts.createSourceFile('fixture.ts', content, ts.ScriptTarget.Latest, true);
}

const jsxWithHtml = (value: string) =>
  `const el = <div dangerouslySetInnerHTML={{ __html: ${value} }} />;`;

describe('astHelpers (mutation-baseline kills)', () => {
  describe('findDangerouslySetInnerHTML: static-svg classification is fully anchored', () => {
    it('a pure SVG literal (with attributes and children) classifies as static-svg', () => {
      const hits = findDangerouslySetInnerHTML(
        tsx(jsxWithHtml(`'<svg width="4"><path d="M0 0"/></svg>'`)));
      assert.equal(hits.length, 1);
      assert.equal(hits[0].valueKind, 'static-svg');
    });

    it('SVG followed by a script payload is NOT static-svg (trailing anchor)', () => {
      const hits = findDangerouslySetInnerHTML(
        tsx(jsxWithHtml(`'<svg></svg><script>alert(1)</script>'`)));
      assert.equal(hits.length, 1);
      assert.equal(hits[0].valueKind, 'literal-string',
        'content after </svg> must disqualify the static-svg downgrade — this is an XSS vector');
    });

    it('markup before the <svg> is NOT static-svg (leading anchor)', () => {
      const hits = findDangerouslySetInnerHTML(
        tsx(jsxWithHtml(`'<div onclick="x()"></div><svg></svg>'`)));
      assert.equal(hits.length, 1);
      assert.equal(hits[0].valueKind, 'literal-string');
    });
  });

  describe('findHighComplexityFunctions: threshold is exclusive (flag only when EXCEEDED)', () => {
    // Complexity = 1 + number of ifs.
    const fn = (name: string, ifs: number) =>
      `function ${name}(a: number) {\n${'  if (a) { a++; }\n'.repeat(ifs)}  return a;\n}`;

    it('complexity exactly at the threshold is not flagged; one over is', () => {
      const sf = tsSrc(`${fn('atThreshold', 2)}\n${fn('overThreshold', 3)}`);
      const hits = findHighComplexityFunctions(sf, 3);
      assert.deepEqual(hits.map(h => h.name), ['overThreshold'],
        'threshold is exclusive: complexity 3 with threshold 3 must NOT be flagged');
      assert.equal(hits[0].complexity, 4);
    });
  });
});
