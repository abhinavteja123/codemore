# core-security-innerhtml-assignment

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| security | BLOCKER (literal source: MAJOR) | beta | 0.9 dynamic / 0.7 literal |

**Pack:** `core-security`

## What it catches

Three DOM sinks in vanilla TS / JS:

- `<expr>.innerHTML = <value>`
- `<expr>.outerHTML = <value>`
- `<expr>.insertAdjacentHTML(<where>, <value>)`

The matcher classifies the right-hand side:

| Value source | Severity |
|---|---|
| Variable, prop, function call, member access, template literal with `${…}` | **BLOCKER** |
| Plain string literal (`'…'`, `"…"`, untemplated `` `…` ``) | **MAJOR** |

This is the framework-free counterpart to [`vibe-xss-dangerously-set`](./vibe-xss-dangerously-set.md). The detection logic and severity model are the same; the sink is different.

## Why it matters

Direct DOM HTML injection is the single most-cited stored-XSS pattern in non-framework code. Even when the value source looks safe today, leaving an `innerHTML` assignment in the codebase invites the next maintainer to pipe a variable through it.

## Example: failing code

```ts
container.innerHTML = post.html;                                          // BLOCKER
footer.outerHTML = `<small>${post.title}</small>`;                        // BLOCKER
el.insertAdjacentHTML('beforeend', userInput);                            // BLOCKER
el.innerHTML = '<hr/>';                                                   // MAJOR
```

## Example: how to fix

Pick the structured replacement that matches the case:

```ts
// (a) Plain text — let the DOM escape for you
container.textContent = post.text;

// (b) Build DOM nodes structurally
const h1 = document.createElement('h1');
h1.textContent = post.title;
container.appendChild(h1);

// (c) Rich text from a trusted markdown pipeline — sanitise first
import DOMPurify from 'dompurify';
container.innerHTML = DOMPurify.sanitize(html);
```

## Known limitations

- We do not detect sanitisers (`DOMPurify.sanitize(x)`). A v1.1 AST pass will downgrade severity when a recognised sanitiser wraps the value.
- Regex-only — escaped quotes and string concatenation across multiple lines may slip past.
- Reading `.innerHTML` (right-hand side) is not flagged — only assignment.

## Suppression

```ts
// codemore-ignore-next-line: core-security-innerhtml-assignment
el.innerHTML = TRUSTED_COMPILE_TIME_CONSTANT;
```

Or for an entire file:

```ts
/* codemore-ignore-file: core-security-innerhtml-assignment */
```

## References

- [MDN — Element.innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML)
- [OWASP — Cross Site Scripting Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify](https://github.com/cure53/DOMPurify)
