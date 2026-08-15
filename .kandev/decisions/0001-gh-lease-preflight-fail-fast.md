# LDR-0001: GitHub CLI lease preflight before PR body

- **Date:** 2026-08-11
- **Status:** accepted
- **Deciders:** Executor (KanDev gh/lease auth thrash ticket)

## Context

On KanDev sessions, `git push` often works via SSH while `gh` needs the lease-aware
shim. Agents were drafting large PR bodies then thrash-probing alternate credentials
when bare `gh` failed. That wastes time and risks unsafe secret probing. This stays an
LDR (process tactic inside existing Remote Git Policy), not an ADR.

## Decision

1. Run `.kandev/scripts/gh-preflight.sh` (or equivalent lease-first checks) **before**
   drafting a PR body or calling `gh pr create`.
2. On FAIL / broker 401 / missing lease vars: **stop once**, report the exact error in
   task chat, escalate — no alternate credential sources, no secrets-DB decrypt.
3. Always invoke `gh` with `$KANDEV_GITHUB_CLI_SHIM_DIR` first on `PATH`.

## Consequences

- Failures surface early with a cheap preflight instead of after a long PR draft.
- Host/PATH bugs (shim after `~/.local/bin`) are detectable without thrashing.
- Platform must still put the shim ahead of any competing `gh` for zero-friction sessions;
  Agent OS documents the workaround (`PATH="$KANDEV_GITHUB_CLI_SHIM_DIR:$PATH"`).
