# Workflow: Bug Fix

Correct incorrect behaviour with a regression guard. Lightweight by default.

> Coordinated by the [Orchestrator](../prompts/orchestrator.md): it returns between steps and
> chooses the next based on project state; specialists report back to it. Executors also run
> the human validation gate in the task chat per [`_shared.md`](../prompts/_shared.md). The
> sequence below is typical, not rigid.

## Sequence (Orchestrator-coordinated)

1. **[Discovery](../prompts/discovery.md)** → [bug-ticket](../templates/bug-ticket.md):
   reproduction, expected vs actual, suspected root cause.
2. **[Executor](../prompts/executor.md)** (KanDev **Executor** profile) → fix the **root cause** (not the symptom,
   [`CURSOR.md`](../../CURSOR.md)); **add a regression test**; climb the validation ladder
   (live site + clear console when applicable); offer primary-local sync; open PR only after
   the human asks; capture Visual Validation if UI changed.
3. **[Reviewer](../prompts/reviewer.md)** → confirm the fix, the regression test, and no new
   boundary violations; report back to the Orchestrator.

## When to involve Architect

Only if the bug reveals a design flaw (a boundary or dependency rule is wrong). Then branch
to a short [Architect](../prompts/architect.md) pass and record an
[ADR](../templates/architecture-decision.md) or [LDR](../decisions/).

## Exit

Regression test in place; validation green; human has tested (or waived); PR open for human
review/squash-merge ([Remote Git Policy](../prompts/_shared.md)).
