# Domain Docs

This is a single-context repository.

## Before exploring

Read when present:

- `CONTEXT.md` at the repository root;
- relevant ADRs under `docs/adr/`.

If these files do not exist, proceed silently. The domain-modeling workflows create them lazily when terminology or architectural decisions are resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   ├── agents/
│   └── adr/
└── src/
```

## Vocabulary

Use the terms defined in `CONTEXT.md`. Avoid introducing synonyms that contradict its glossary.

If a necessary concept is missing, reconsider whether new terminology is needed or record the gap for domain modeling.

## ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.
