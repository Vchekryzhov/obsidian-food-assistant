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

### Development workflow

Use the installed Matt Pocock engineering skills as the default development workflow. Start with `ask-matt` when routing is unclear; use `to-spec` and `to-tickets` for planning, `implement` or `implement-spec` with `tdd` for delivery, `diagnosing-bugs` for failures, `code-review` for reviews, and `codebase-design` or `domain-modeling` for architecture and domain changes. Read and follow the selected skill before acting.

### Issue tracker

Issues and specs are tracked in GitHub Issues for `Vchekryzhov/obsidian-food-assistant`. See `docs/agents/issue-tracker.md`.

### Delivery completion

- Keep implementation completion and delivery completion separate.
- Close an issue only after the final changes are committed and the commit is pushed to the remote branch; when the workflow uses a pull request, close it only after the pull request is merged.
- If the work is only local or uncommitted, leave the issue open and report the remaining delivery step explicitly.

### Triage labels

Use the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` at the root and ADRs under `docs/adr/`. See `docs/agents/domain.md`.
