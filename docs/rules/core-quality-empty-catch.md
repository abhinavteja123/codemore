# core-quality-empty-catch

| Category | Default severity | Lifecycle | Default confidence |
|---|---|---|---|
| bug | MAJOR | experimental | 0.9 (clamped to 0.6 while experimental) |

## What it catches

`catch (binding) { }` and `catch { }` with an empty body. Block comments are stripped before matching, so `catch { /* TODO */ }` also fires — the comment doesn't change runtime behaviour.

## Why it matters

Empty catches turn every failure into a silent no-op. Network failures, write errors, unexpected nulls — all become "everything worked fine" to the caller. This is one of the highest-signal patterns for silent-data-loss bugs in production, and AI tools often insert them just to satisfy linter / type errors without thinking about the actual failure mode.

## Example: failing code

```ts
try { await persist(data); }
catch (e) { }                        // MAJOR
```

## Example: how to fix

Pick the response that matches what the catch actually means:

```ts
// (a) Log the failure with context (most common)
catch (err) {
  logger.warn({ err: sanitize(err) }, 'persist failed');
}

// (b) Rethrow with extra context
catch (err) {
  throw new Error(`persist failed for ${id}`, { cause: err });
}

// (c) Deliberate fallback — document why
catch (err) {
  // expected when the table is empty
  return defaultValue;
}
```

## Suppression

If you truly need to swallow the error (rare):

```ts
// codemore-ignore-next-line: core-quality-empty-catch
catch { /* expected when initial state is missing */ }
```

## References

- [ESLint — no-empty](https://eslint.org/docs/latest/rules/no-empty)
