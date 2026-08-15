# Workflow: Promote to PWA-Base

Move code from an app (or a candidate module) **up** into the shared foundation
`@songara/pwa-base`, or graduate a **Preview** integration to **Stable**. This is the
workflow that makes PWA-Base a real platform.

Triggered and coordinated by the **[Orchestrator](../prompts/orchestrator.md)**. Driven by
the **[Maintainer](../prompts/maintainer.md)**, with an
**[Architect](../prompts/architect.md)** decision and an
**[Executor](../prompts/executor.md)** implementation. Each specialist reports back to the
Orchestrator, which decides milestone readiness.

Lifecycle authority: [ADR-008](../../docs/adr/008-preview-stable-capability-lifecycle.md),
[capability-lifecycle.md](../../docs/guides/capability-lifecycle.md),
[preview-packages.md](../../docs/guides/preview-packages.md).

## Two paths

| Path | When | Gate |
| --- | --- | --- |
| **A — App-local → Preview or Stable** | Extracting from a product/catalogue spike | Preview: ADR-008 entry criteria. Stable: prefer ADR-003 two-consumer (or Architect-signed graduation) |
| **B — Preview → Stable** | Graduating `@songara/pwa-base/preview/<name>` | Real **product** usage + engineering confidence; Test-PWA alone is insufficient |

## Gate — Stable confidence (required for Stable)

Per [ADR-003](../../docs/adr/003-phase2-shared-packages.md) and ADR-008:

- Prefer a **second product** consumer using the API **unchanged**, recorded in the
  [promotion-ticket](../templates/promotion-ticket.md).
- One strong product + clear standardisation intent may suffice with Architect ADR/LDR
  sign-off.
- Hello and Test-PWA are **not** product consumers for this gate.

**Preview entry** does not require two consumers — use ADR-008 Preview criteria and the
Orchestrator ticket shape in [preview-packages.md](../../docs/guides/preview-packages.md).

## Steps

1. **Maintainer/Architect** — confirm which path (Preview vs Stable); choose the target
   package and a documented public entry point (see
   [`consuming-pwa-base.md`](../../docs/guides/consuming-pwa-base.md)). Record the
   decision: formal [ADR](../templates/architecture-decision.md) if it changes a
   boundary/dependency rule/public API; otherwise an [LDR](../decisions/).
2. **Executor** — move or graduate the code, wire the export, and update:
   - the dependency-rules table in [`docs/architecture.md`](../../docs/architecture.md),
   - the public API table in [`consuming-pwa-base.md`](../../docs/guides/consuming-pwa-base.md),
   - and check the "remaining work before publishing" list there.
   For Preview→Stable: deprecate `@songara/pwa-base/preview/<name>` and point consumers
   at the Stable subpath. Verify a consumer builds against the new entry point. Respect
   the internal/public split (consumers import only from `@songara/pwa-base`).
3. **Maintainer** — versioning: Stable renames/removals are **breaking**; bump per
   [`docs/guides/versioning.md`](../../docs/guides/versioning.md) and root `VERSION`.
   Preview-only breakage follows the Preview policy in
   [preview-packages.md](../../docs/guides/preview-packages.md).
4. **Reviewer** — read-only pass; verify no consumer imports an internal path, Stable
   does not depend on Preview, and the docs match the exports.

## Exit

Public API and docs in sync, gate evidence recorded, version bumped as needed, human
review via PR / squash-merge ([`CONTRIBUTING.md`](../../CONTRIBUTING.md),
[Remote Git Policy](../prompts/_shared.md)).
