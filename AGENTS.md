# Repository instructions

This repository packages an Obsidian food-assistant module and its installer plugin.

## Boundaries

- `module/instructions/` and `module/skills/` are package-managed agent instructions.
- `module/templates/` are first-install defaults for user-owned vault data.
- Never add personal recipes, inventory, shopping history, credentials, vault paths, or store tokens to this repository.
- The installer must not overwrite user-owned data. Preserve the `create-if-missing` policy for templates.
- Managed files may update only when their current hash matches the hash recorded by a previous installation.
- Keep Copilot integration behind command invocation; do not import its private implementation.

## Checks

Before finishing a change, run:

```bash
npm run check
```

When changing installation semantics, add or update tests for first install, repeat install, local edits, and pre-existing files.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `Vchekryzhov/obsidian-food-assistant`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
