# ADR-NNN: <title>

> **Drafting shape only.** The accepted record lives in [`docs/adr/`](../../docs/adr/) and
> is indexed in [`docs/adr/README.md`](../../docs/adr/README.md). Use this template to draft
> a **formal** ADR (a boundary, dependency-rule, or public-API change). For a tactical,
> reversible choice, use a lightweight [decision record](../decisions/) instead.

## Status

Proposed | Accepted | Superseded by ADR-XXX

## Context

The forces at play: requirements, constraints, and the prior state. Link relevant
[architecture](../../docs/architecture.md) sections and existing ADRs.

## Decision

The decision, stated plainly.

### Preview vs Stable vs app-local

Per [ADR-008](../../docs/adr/008-preview-stable-capability-lifecycle.md) and
[ADR-003](../../docs/adr/003-phase2-shared-packages.md):

- **App-local** — single-app or unevaluated spike; stays in the sibling repo / Test-PWA
  exploration until Preview entry or Stable extraction.
- **Preview** — curated thin OSS integration under `@songara/pwa-base/preview/<name>`.
  Record why ADR-008 entry criteria are met (selected OSS, thin wrapper, standardisation
  intent). Catalogue Ready alone is not enough.
- **Stable** — prefer two **product** consumers using the API unchanged (ADR-003), or
  Architect-signed graduation from Preview after real product usage. Hello and Test-PWA
  are not product consumers for this gate.

Record the consumers / Preview export path, or state why the code stays app-local.

## Consequences

### Positive

-

### Negative / trade-offs

-

### Follow-up

- Docs to update (e.g. dependency table in `docs/architecture.md`,
  [`consuming-pwa-base.md`](../../docs/guides/consuming-pwa-base.md),
  [`preview-packages.md`](../../docs/guides/preview-packages.md) when Preview is involved).
