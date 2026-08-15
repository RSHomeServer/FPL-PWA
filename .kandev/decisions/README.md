# Lightweight Decision Records (LDRs)

Quick, local records of **tactical, reversible** decisions made within an already-accepted
architecture boundary. LDRs are cheap to write and cheap to change.

## LDR vs formal ADR

| | Lightweight Decision Record (here) | Formal ADR ([`docs/adr/`](../../docs/adr/)) |
| --- | --- | --- |
| Scope | Tactical choice inside an accepted boundary | Changes a boundary, dependency rule, or public API |
| Cost | Minutes; one short file | Reviewed decision; indexed |
| Reversibility | Easily reversed | Expensive to reverse |
| Examples | naming, file layout, a library pick for one app, a default value | shared-vs-app-local placement, `@songara/pwa-base` exports, new dependency rule |

Rule of thumb: *if it changes something in the `docs/architecture.md` dependency table or
the public API, it's an ADR. Otherwise it's an LDR.* When in doubt, start with an LDR; if it
turns out to move a boundary, promote it to a formal ADR draft using
[`../templates/architecture-decision.md`](../templates/architecture-decision.md).

## How to add one

1. Copy [`0000-template.md`](./0000-template.md) to `NNNN-short-title.md` (next number).
2. Fill it in — a few lines is fine.
3. Link it from the ticket or PR that motivated it.

LDRs are append-only history. To reverse one, add a new LDR that supersedes it (reference
its number) rather than editing the old file.
