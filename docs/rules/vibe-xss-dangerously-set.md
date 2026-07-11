# vibe-xss-dangerously-set

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER (literal: MAJOR) | beta | 0.9 dynamic / 0.75 literal |

**Pack:** `core-security`

## What it catches

React's `dangerouslySetInnerHTML={{ __html: <expr> }}` attribute, anywhere in TSX / JSX (and `.ts` / `.js` files that import React and use JSX). The matcher classifies the captured `__html` expression:

| Expression shape | Severity | Why |
|---|---|---|
| Variable, prop, function call, member access | **BLOCKER** | Source is dynamic — any path that lets a user contribute to the value is stored XSS. |
| Template literal containing `${…}` | **BLOCKER** | Interpolation injects values into the rendered HTML. |
| Plain string literal (`'…'`, `"…"`, untemplated `` `…` ``) | **MAJOR** | No immediate XSS, but the markup should be JSX nodes so React's escaping protects you when the value later becomes dynamic. |
| Pure inline SVG literal | **MAJOR** | Lower-urgency design smell. Prefer an Icon library / imported SVG component. |

## Why it matters

React deliberately named this attribute "dangerously". Anything passed via `__html` bypasses React's escaping and is inserted into the DOM as live HTML.

- Veracode's 2025/26 study found **86% of AI-generated code samples failed to defend against XSS**.
- `dangerouslySetInnerHTML` is the single React API most often used as the unsafe sink. Prompts like *"render this markdown as HTML"* or *"insert this rich-text response into the page"* commonly produce this exact attribute, frequently without a sanitiser.

The same code that ships a one-off "render the LLM's reply" feature is the code that ships persistent stored-XSS if the reply path is ever attacker-influenced.

## Example: failing code

```tsx
// BLOCKER — prop is dynamic, untrusted by default
<div dangerouslySetInnerHTML={{ __html: body }} />

// BLOCKER — template literal interpolates user content
<footer dangerouslySetInnerHTML={{ __html: `<small>by ${title}</small>` }} />

// MAJOR — string literal markup (design smell, not immediate XSS)
<div dangerouslySetInnerHTML={{ __html: '<em>End of post</em>' }} />
```

## Example: how to fix

### (a) Prefer JSX — works for most cases

```tsx
<div>{body}</div>
```

React escapes `body` automatically. If you need bold / italic structure, render it as JSX nodes:

```tsx
<div><em>End of post</em></div>
```

### (b) If the source is rich text from a trusted pipeline, sanitise first

```tsx
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```

DOMPurify (or sanitize-html, or similar) strips script tags, event handlers, and other XSS vectors. **The sanitiser must wrap the `__html` value directly** — sanitising once at the source and then transforming further loses the protection.

### (c) If you're rendering Markdown, use a Markdown component

```tsx
import ReactMarkdown from 'react-markdown';

<ReactMarkdown>{markdownSource}</ReactMarkdown>
```

## Known limitations

- The matcher is regex-based. Deeply-nested attribute syntax (e.g. JSX inside a complex object spread) may slip past. A JSX-AST path lands when more frontend rules need it.
- **JSX-as-string-content matches too.** If you embed a string literal that *contains* the JSX attribute as text (e.g. a docs page showing the attribute as an example), the rule will fire. Suppress those lines with `// codemore-ignore-next-line: vibe-xss-dangerously-set`. Removing this limitation requires AST-aware string-literal stripping.
- **Values containing literal `}}` terminate early.** Extremely rare in real JSX attributes; the rule would simply not match those.
- We do not detect whether the expression is **already sanitised** (`DOMPurify.sanitize(x)`). A future v1.1 will inspect the AST and downgrade severity when a recognised sanitiser wraps the source.
- We do not look at imports to confirm `dangerouslySetInnerHTML` is the React attribute — but the JSX syntax `<elem dangerouslySetInnerHTML={…} />` is React-specific and the pattern is unambiguous in practice.

## Suppression

If the source is a trusted compile-time constant (e.g. a tiny inline SVG from a vetted source):

```tsx
{/* codemore-ignore-next-line: vibe-xss-dangerously-set */}
<span dangerouslySetInnerHTML={{ __html: TRUSTED_SVG_LITERAL }} />
```

Per file:

```tsx
/* codemore-ignore-file: vibe-xss-dangerously-set */
```

Or disable globally in `.codemorerc.json`:

```jsonc
{ "rules": { "vibe-xss-dangerously-set": "off" } }
```

## References

- [React docs — dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerouslysetinnerhtml)
- [OWASP — Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify](https://github.com/cure53/DOMPurify)
- [Veracode — AI-generated code security study 2025/26](https://www.veracode.com/resources/)
