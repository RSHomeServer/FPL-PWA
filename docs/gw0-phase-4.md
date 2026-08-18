# GW0 Phase 4 — in-app validation

Generated: 2026-08-18T09:56:38.407Z

Output of `docs/gw0-modelling-plan.md` §18 Phase 4. Produced by `npm run gw0:phase4`.

`/gw0` loads a committed JSON summary of `docs/gw0-phase-0-validation.md`. It does not re-run the Phase 0 harness or re-fit defaults.

## What the UI shows

- Shipped GW1 pooled skill (FDR goals + CS tables): RMSE **2.671**, MAE 1.954, Spearman 0.347 (n=2992).
- Per-transition GW1 RMSE range from the Phase 0.1 table: **2.473–3.145** (Approach A, no FDR, $k_{\mathrm{trans}}=1$).
- Independent as-of-GW0 GW1–6 RMSE from the Horizon table.
- Per-player and per-15 `E[pts GW1]` vs official `ep_next` (reference only), plus largest `|delta|` in the LP pool.
- JSON and CSV download of both 15s.

## Horizon RMSE (copied, not re-fit)

| GW | RMSE |
| --- | --- |
| 1 | 2.677 |
| 2 | 2.807 |
| 3 | 2.646 |
| 4 | 2.81 |
| 5 | 2.58 |
| 6 | 2.757 |

## Squad RMSE

Squad totals are sums of noisy per-player EPs. Phase 0's unconstrained top-15 diagnostic is mean actual GW1 points of the 15 highest projected players versus prior-points leaders, with FPL constraints ignored — not a legal-squad RMSE, so none is shown.

## How to regenerate

```bash
npm run gw0:phase4
```

Reads `docs/gw0-phase-0-validation.md` and writes `src/analysis/gw0Phase0Bands.json` plus this file.
