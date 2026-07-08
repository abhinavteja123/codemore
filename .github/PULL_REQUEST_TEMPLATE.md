## What / why

<!-- One concern per PR. What changed, and why — the diff already shows the what. -->

## Checklist

- [ ] `npm run test:unit` passes
- [ ] `npx tsc -p tsconfig.publish.json` is clean
- [ ] Rule PRs only: follows [CONTRIBUTING-RULES.md](../CONTRIBUTING-RULES.md) — rule module + TP/FP fixtures under `corpus/rules/<rule-id>/{tp,fp}/` + docs page + pack registration (`node scripts/validate-rule-pr.js` reports passed)
