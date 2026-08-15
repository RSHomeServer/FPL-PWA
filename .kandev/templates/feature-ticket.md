# Feature Ticket: <title>

> Follows a [discovery-ticket](./discovery-ticket.md). Implemented by the
> [Executor](../prompts/executor.md) via the [new-feature](../workflows/new-feature.md) workflow.
> KanDev profile: **Executor**. Remote Git Policy: [`../prompts/_shared.md`](../prompts/_shared.md).

- **Discovery:** link to the discovery ticket
- **Decision:** link to the ADR ([draft](./architecture-decision.md) → `docs/adr/`) or
  [LDR](../decisions/), if any

## Before you start — sync + feature branch

```bash
cd "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base"
git fetch origin && git checkout main && git pull --ff-only origin main

cd "<this-worktree>"
git fetch origin && git merge --ff-only origin/main
git checkout -b <feature-branch>
```

Do **not** commit on `main`. Details: [`../prompts/_shared.md`](../prompts/_shared.md).

## Summary

What is being added and the user-visible outcome.

## Motivation

Why now; the problem it solves (link Discovery rather than restating it).

## Design

The approach and boundaries from the Architect. Affected packages:

| Package / path | Change |
| --- | --- |
|  |  |

State whether anything is a candidate for [promotion](../workflows/promote-to-pwa-base.md)
under the two-consumer rule.

## Validation plan

Climb the ladder from [`CURSOR.md`](../../CURSOR.md); tick what applies:

- [ ] build
- [ ] typecheck
- [ ] unit
- [ ] integration
- [ ] Playwright (UI / user flows)
- [ ] Visual Validation captured & described (UI changes)

## Actions Required

Developer steps with **why / priority / expected outcome**, or "No developer action required."
These belong in the completion report; the report shape is defined in
[`packages/completion-report/src/types.ts`](../../packages/completion-report/src/types.ts) — do not redefine it here.

## Wrap-up

Human validation gate ([`_shared.md`](../prompts/_shared.md)):

1. Commit on the feature branch after ladder + live-site/console validation (when applicable).
2. Ask in **plain chat** whether to sync the primary local checkout for human testing; remain
   idle until they reply. Do **not** use clickable question cards.
3. Open/update the PR into `main` **only after** they ask to raise a PR.
4. Completion table (branch + PR URL) → `step_complete_kandev`.

**Do not** merge, approve, or push `main`. Human reviews and squash-merges; the next ticket
syncs to `origin/main` after that merge.
