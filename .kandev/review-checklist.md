# Review checklist

Living checklist for the [Reviewer](./prompts/reviewer.md) role. Prefer this over archived
`docs/archive/reviews/*` packages. Review against the **pull request** (Remote Git Policy:
[`.kandev/prompts/_shared.md`](./prompts/_shared.md)).

## Scope and intent

- [ ] Specialist synced to `origin/main` and worked on a **feature branch** (not `main`).
- [ ] PR targets `main`; one logical ticket per PR where practical.
- [ ] Change matches the ticket / objective (not drive-by scope).
- [ ] No revival of deleted product apps, catalogue host, or Telemetry in this repo.
- [ ] Sibling-app changes import only documented `@songara/pwa-base` entry points.

## Correctness and boundaries

- [ ] Dependency rules in `docs/architecture.md` / ADRs respected.
- [ ] Public API changes update `docs/guides/consuming-pwa-base.md`.
- [ ] No speculative shared packages (ADR-003 two-consumer rule).

## Validation and DoD

- [ ] Validation ladder in `CURSOR.md` actually run for the change.
- [ ] Site/UI tickets: live affected routes loaded; browser console clear of change-caused errors.
- [ ] UI changes include Visual Validation narrative (`pnpm capture:artifacts` when wired).
- [ ] Structured `RunCompletionSummary` conforms to `packages/completion-report`.

## Git and hand-off

- [ ] Commits have no editor/AI co-author or "generated with" trailers.
- [ ] Commit messages do not mention AI/tooling.
- [ ] Human validation gate followed: local-sync offered in plain chat; PR opened only after human ask.
- [ ] Specialist provided completion table with **branch name** and **PR URL** (or N/A).
- [ ] No agent merge/approve of the PR; human owns squash-merge to `main`.

## Severity guide

| Severity | Meaning |
| --- | --- |
| blocker | Correctness, security, or contract break — must fix before merge |
| major | Likely user/dev pain or DoD gap |
| minor | Clear improvement, not blocking |
| nit | Optional polish |
