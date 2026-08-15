# Discovery Ticket: <title>

> Produced by the [Discovery](../prompts/discovery.md) role. For informational-only
> findings use [research-report.md](./research-report.md) instead.

- **Date:**
- **Requested by:**
- **Classification:** new feature | bug fix | refactor
- **Suggested workflow:** [new-feature](../workflows/new-feature.md) | [bug-fix](../workflows/bug-fix.md) | [refactor](../workflows/refactor.md)

## Before you start — sync to `origin/main`

```bash
cd "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base"
git fetch origin && git checkout main && git pull --ff-only origin main
cd "<this-worktree>" && git fetch origin && git merge --ff-only origin/main
```

See [`../prompts/_shared.md`](../prompts/_shared.md). If this Discovery output becomes an
implementation ticket, that ticket must use a **feature branch + PR** (never merge to
`main` directly).

## Problem

One or two sentences: what is wrong or missing, for whom, and the desired outcome.

## Context

Links to existing intent already checked (`docs/milestones/`, `docs/guides/`, ADRs).

## Scope

- **In scope:**
- **Out of scope:**

## Acceptance criteria

Observable, testable statements of done.

- [ ]
- [ ]

## Open questions & assumptions

-

## Hand-off

- Architect pass needed? yes / no (skip for small, boundary-preserving changes)
- Next template: [feature-ticket](./feature-ticket.md) | [bug-ticket](./bug-ticket.md)

_Validation and Definition of Done are inherited from [`CURSOR.md`](../../CURSOR.md); do not restate them here._
