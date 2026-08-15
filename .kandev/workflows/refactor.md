# Workflow: Refactor

Improve structure **without changing behaviour**.

> Coordinated by the [Orchestrator](../prompts/orchestrator.md): it returns between steps and
> chooses the next based on project state; specialists report back to it, not the user. The
> sequence below is typical, not rigid.

## Sequence (Orchestrator-coordinated)

1. **[Architect](../prompts/architect.md)** *(leads)* → define the target shape and the
   boundaries it must preserve; confirm the dependency rules in
   [`docs/architecture.md`](../../docs/architecture.md). Record an
   [ADR](../templates/architecture-decision.md) if a boundary/API moves, else an
   [LDR](../decisions/).
2. **[Executor](../prompts/executor.md)** → apply the refactor incrementally; rely on
   existing tests to prove behaviour is unchanged; add characterization tests where coverage
   is thin. No scope creep — behaviour changes belong in a separate feature/bug ticket.
3. **[Reviewer](../prompts/reviewer.md)** → confirm **no behavioural drift** and no new
   boundary violations; check the validation ladder was run; report back to the Orchestrator.

The Orchestrator may split an independent refactor across **parallel Executors** where files
and packages do not overlap.

## Guardrails

- Prefer extending existing systems over new parallel ones ([`CURSOR.md`](../../CURSOR.md)).
- If the refactor extracts reusable code, it may trigger the
  [promote-to-pwa-base](./promote-to-pwa-base.md) workflow under the two-consumer rule.

## Exit

Behaviour identical, validation green; PR open for human review/squash-merge
([Remote Git Policy](../prompts/_shared.md)).
