# Contributing

Thank you for contributing to the FPL decision-support PWA.

## Branch workflow

Integration path: **feature branch → pull request → human review → squash merge**.
`main` is immutable except through an approved PR.

- Branch from up-to-date `origin/main`.
- Keep changes focused; prefer one PR per logical ticket.
- Do not push directly to `main`, auto-merge, force-push, or bypass branch protection
  unless the user explicitly instructs it.
- Commits must not include editor/AI co-author trailers or tooling branding.

Process details live in [`.kandev/`](./.kandev/) (copied from PWA-Base). Remote Git
Policy: [`.kandev/prompts/_shared.md`](./.kandev/prompts/_shared.md). Engineering
contract, validation ladder, and Definition of Done:
[PWA-Base `CURSOR.md`](../PWA-Base/CURSOR.md). Foundation contributor guide:
[PWA-Base `CONTRIBUTING.md`](../PWA-Base/CONTRIBUTING.md).

## Shared foundation

This app consumes `@songara/pwa-base` via `file:../PWA-Base`. Import only documented
public entry points. Do not deep-import `@platform/*`. See
[consuming-pwa-base.md](../PWA-Base/docs/guides/consuming-pwa-base.md).
