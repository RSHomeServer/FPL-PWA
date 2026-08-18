# GW0 Phase 1 — official API ingest and as-of-GW0 projections

Generated: 2026-08-18T11:02:08.016Z

Prototype output of `docs/gw0-modelling-plan.md` §18 table 1.1–1.5. Produced by `npm run gw0:phase1`.

This is **not** a recommended 15-player squad. There is no optimiser in this ticket. Rows below are a small sample across positions so the join, rates, FDR, fitness, and audit trail can be inspected against live 2026/27 data.

## Sources

- Official FPL bootstrap + fixtures (590 elements, 380 fixtures). Prices are `now_cost` from this API, not vaastav.
- Prior rates: vaastav **2025-26** `players_raw` + `merged_gw` (join key **`code`**, never season `id`).
- Next event: GW1 (2026-08-21T17:30:00Z).
- Live season id: `2026-27`.

## Defaults (Phase 0 — not re-fit here)

| Knob | Value |
| --- | --- |
| Shrinkage | linear / 900 |
| $k_{\mathrm{trans}}$ | 0.75 (unknown club continuity ⇒ 1) |
| Rate model | Approach A only (α = 1). Approach B is diagnostic. |
| FDR | Frozen multi-season multiplicative tables from Phase 0 |
| Home/away ±5% | Off |
| DEF/GK blend | 0.5 / 0.3 |
| $m_{\mathrm{sem}}$ | 1.0 |
| horizon_factor | 1.0 |

Honest GW1 accuracy remains about **2.7 pts RMSE per player**. Do not read the table as a claim of better skill.

## Horizon

> GW2–GW6 projections do not condition on unknown future events that may occur after GW1.

Each GW uses the same as-of-GW0 rate prior; only that GW’s official fixtures (FDR) change.

## Pool

| Check | n |
| --- | --- |
| Official elements with `code` | 590 |
| Joined with ≥90 prior minutes | 372 |
| New-to-PL / <90 prior minutes | 218 |
| Transferred | 43 |
| Unknown club continuity | 130 |
| $m_{\mathrm{fitness}}=0$ | 76 |
| GW1 fixtures | 10 |

## Sample (not a best 15)

| Player | Pos | Club | Price | adj_p90 | E min GW1 | FDR GW1 | E pts GW1 | E pts GW1–6 | Conf | ep_next | Audit (GW1) |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | --- |
| Raya | GK | ARS | 6.0 | 4.38 | 90 | 2 | 4.38 | 20.05 | HIGH | 4 | prior 3330m raw_p90=4.38 c=1.00 baseline=3.34 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_fit=1.00 rate=4.38 E_pts=4.38 |
| Darlow | GK | MUN | 4.5 | 2.42 | 76.5 | 2 | 2.06 | 9.87 | LOW | 1.4 | prior 1980m raw_p90=3.23 c=1.00 baseline=3.34 k_trans=0.75 E_min=76.5 FDR=2 f=1.00 m_fit=0.85 rate=2.06 E_pts=2.06 |
| Meslier | GK | ARS | 5.0 | 3.34 | 89.87 | 2 | 3.33 | 15.26 | LOW | 2.6 | prior 0m raw_p90=na c=0.00 baseline=3.34 k_trans=1 E_min=89.9 FDR=2 f=1.00 m_fit=1.00 rate=3.33 E_pts=3.33 |
| Jörgensen | GK | CHE | 5.0 | 2.84 | 0 | 3 | 0 | 0 | LOW | 0 | prior 378m raw_p90=2.14 c=0.42 baseline=3.34 k_trans=1 E_min=0.0 FDR=3 f=0.75 m_fit=0.00 rate=0.00 E_pts=0.00 |
| Gabriel | DEF | ARS | 8.0 | 6.84 | 87.1 | 2 | 6.62 | 30.94 | HIGH | 4 | prior 2750m raw_p90=6.84 c=1.00 baseline=3.78 k_trans=1 E_min=87.1 FDR=2 f=1.00 m_fit=1.00 rate=6.62 E_pts=6.62 |
| Senesi | DEF | TOT | 6.0 | 3.59 | 90 | 3 | 2.77 | 16.7 | MEDIUM | 2.8 | prior 3288m raw_p90=4.79 c=1.00 baseline=3.78 k_trans=0.75 E_min=90.0 FDR=3 f=0.77 m_fit=1.00 rate=2.77 E_pts=2.77 |
| A.García | DEF | AVL | 4.0 | 3.78 | 65.27 | 3 | 2.11 | 12.74 | LOW | 1 | prior 83m raw_p90=na c=0.00 baseline=3.78 k_trans=1 E_min=65.3 FDR=3 f=0.77 m_fit=1.00 rate=2.11 E_pts=2.11 |
| J.Timber | DEF | ARS | 6.5 | 5.47 | 0 | 2 | 0 | 0 | LOW | 0 | prior 2452m raw_p90=5.47 c=1.00 baseline=3.78 k_trans=1 E_min=0.0 FDR=2 f=1.00 m_fit=0.00 rate=0.00 E_pts=0.00 |
| B.Fernandes | MID | MUN | 12.0 | 6.9 | 90 | 2 | 6.9 | 35.05 | HIGH | 4 | prior 3065m raw_p90=6.90 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_fit=1.00 rate=6.90 E_pts=6.90 |
| Bruno G. | MID | ARS | 7.0 | 4.23 | 83.79 | 2 | 3.94 | 19.35 | MEDIUM | 2.5 | prior 2456m raw_p90=5.64 c=1.00 baseline=4.29 k_trans=0.75 E_min=83.8 FDR=2 f=1.00 m_fit=1.00 rate=3.94 E_pts=3.94 |
| Fábio Vieira | MID | ARS | 5.5 | 4.29 | 67.42 | 2 | 3.21 | 15.76 | LOW | 2 | prior 0m raw_p90=na c=0.00 baseline=4.29 k_trans=1 E_min=67.4 FDR=2 f=1.00 m_fit=1.00 rate=3.21 E_pts=3.21 |
| Onana | MID | AVL | 5.0 | 3.9 | 0 | 3 | 0 | 0 | LOW | 0 | prior 1755m raw_p90=3.90 c=1.00 baseline=4.29 k_trans=1 E_min=0.0 FDR=3 f=0.81 m_fit=0.00 rate=0.00 E_pts=0.00 |
| Haaland | FWD | MCI | 15.5 | 7.28 | 90 | 3 | 5.91 | 35.77 | HIGH | 4 | prior 2953m raw_p90=7.28 c=1.00 baseline=4.78 k_trans=1 E_min=90.0 FDR=3 f=0.81 m_fit=1.00 rate=5.91 E_pts=5.91 |
| Welbeck | FWD | CHE | 6.0 | 3.78 | 65 | 3 | 2.22 | 13.38 | MEDIUM | 2 | prior 2249m raw_p90=5.04 c=1.00 baseline=4.78 k_trans=0.75 E_min=65.0 FDR=3 f=0.81 m_fit=1.00 rate=2.22 E_pts=2.22 |
| Madjo | FWD | AVL | 5.5 | 4.78 | 0 | 3 | 0 | 0 | LOW | 0 | prior 0m raw_p90=na c=0.00 baseline=4.78 k_trans=1 E_min=0.0 FDR=3 f=0.81 m_fit=0.00 rate=0.00 E_pts=0.00 |

`ep_next` is a **reference column** from the official API, not the projection objective. EPPM is computed in the engine as a diagnostic and is not shown as a ranking.

## How to rerun

```bash
node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"
npm install
npm test
npm run gw0:phase1
```

Vaastav CSVs cache under `.cache/vaastav/`. Official JSON is fetched live (6h Dexie TTL in the browser source).
