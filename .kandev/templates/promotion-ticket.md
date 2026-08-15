# Promotion Ticket: <candidate> → `@songara/pwa-base`

> Driven by the [Maintainer](../prompts/maintainer.md) via the
> [promote-to-pwa-base](../workflows/promote-to-pwa-base.md) workflow. Gated by the
> **two-consumer rule** ([ADR-003](../../docs/adr/003-phase2-shared-packages.md)).

- **Candidate code:** path(s) today
- **Proposed home:** target package + public entry point in
  [`consuming-pwa-base.md`](../../docs/guides/consuming-pwa-base.md)

## Before you start — sync to `origin/main`

```bash
cd "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base"
git fetch origin && git checkout main && git pull --ff-only origin main
cd "<this-worktree>" && git fetch origin && git merge --ff-only origin/main
```

See [`../prompts/_shared.md`](../prompts/_shared.md). KanDev profile: **Maintainer** (or
**Executor** if the Orchestrator assigns implementation). Ship via **feature branch + PR**;
do not push or merge `main`.

## Two-consumer gate (required)

Promotion is allowed only when a **second** consumer uses the API **unchanged**.

| Consumer | Uses it unchanged? | Where |
| --- | --- | --- |
| 1. |  |  |
| 2. |  |  |

If you cannot name two, it stays app-local. Stop here.

## Public API impact

- New/changed exports:
- Docs to update: dependency table in [`docs/architecture.md`](../../docs/architecture.md),
  [`consuming-pwa-base.md`](../../docs/guides/consuming-pwa-base.md)
- Breaking? renames/removals are breaking — note versioning impact
  ([`docs/guides/versioning.md`](../../docs/guides/versioning.md), root `VERSION`)

## Decision record

- Boundary/API change → formal [ADR](./architecture-decision.md) in `docs/adr/`
- Tactical placement → [LDR](../decisions/)

## Validation & rollback

- [ ] build · typecheck · unit · integration · Playwright (as applicable)
- [ ] a consumer builds against the new entry point
- **Rollback:** how to revert if a consumer breaks

## Actions Required

Release/version steps, or "No developer action required." Human review via PR /
squash-merge — agents do not merge ([Remote Git Policy](../prompts/_shared.md)).
([`CONTRIBUTING.md`](../../CONTRIBUTING.md)).
