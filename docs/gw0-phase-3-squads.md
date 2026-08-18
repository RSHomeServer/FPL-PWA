# GW0 Phase 3 — starting-squad MILP

Generated: 2026-08-18T15:05:29.965Z

Output of `docs/gw0-modelling-plan.md` §14 / §15 / §18 Phase 3. Produced by `npm run gw0:phase3`.

These 15s maximise **expected FPL points** under official constraints. They are not a unique “best” squad. Phase 0 GW1 RMSE is about 2.7 pts per player. Price, expected contribution, and value stay separate; EPPM and `ep_next` are diagnostics / reference only.

## Solver

HiGHS WASM via npm `highs` (lovasoa/highs-js). Runs in the browser for `/gw0` and in Node for the Phase 3 CLI. No backend.

Package: `highs`. Formulation is TypeScript (CPLEX LP text) shared by the CLI and the `/gw0` route.

## Sources

- Official FPL bootstrap + fixtures (592 elements, 380 fixtures).
- Prior rates: vaastav **2025-26** (join key **`code`**).
- Next event: GW1 (2026-08-21T17:30:00Z).
- Live season id: `2026-27`.
- LP pool: 237 (Phase 2 quantitative funnel; `m_fitness = 0` excluded). Funnel LP count 237.
- Default XI formation: **3-4-3**.

## Objectives (two, not three)

Phase 0 did not fit balanced weights `w_g`. Shipped:

| Name | Objective |
| --- | --- |
| **Short-term** | `max Σ x_p E[pts_p,1]` |
| **Long-term** | `max Σ x_p Σ_{g=1..6} E[pts_p,g] (equal weights)` |

## EP trade-off

| Squad | Σ E pts GW1 | Σ E pts GW1–6 | Spend | Remaining | Shared players |
| --- | ---: | ---: | ---: | ---: | ---: |
| Short-term | 68.45 | 344.06 | £100.0m | £0.0m | 7 |
| Long-term | 64.59 | 360.13 | £100.0m | £0.0m | 7 |

Overlap **7**. Short-term only: Sels, Ballard, Maguire, E.Le Fée, Gibbs-White, Mbeumo, Rice, Igor Jesus. Long-term only: Raya, Guéhi, Tarkowski, Dewsbury-Hall, Groß, Semenyo, Stach, Woltemade.

## Short-term 15

GK £10.0m · DEF £29.0m · MID £41.5m · FWD £19.5m. Clubs with 2+: ARS×3 (3-of-club), MUN×3 (3-of-club), NFO×3 (3-of-club), SUN×3 (3-of-club).

Fixture cliff: Roefs (GW4 FDR4, GW5 FDR5); Ballard (GW4 FDR4, GW5 FDR5); E.Le Fée (GW4 FDR4, GW5 FDR5)

| Player | Pos | Club | Price | E GW1 | E GW1–6 | Conf | ep_next | XI / bench | Audit (GW1) |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| Roefs | GK | SUN | 5.0 | 3.89 | 17.77 | HIGH | 2.6 | XI | prior 3150m raw_p90=3.89 c=1.00 baseline=3.34 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.89 E_pts=3.89 |
| Sels | GK | NFO | 5.0 | 3.43 | 15.7 | HIGH | 2.6 | bench 4 | prior 2667m raw_p90=3.54 c=1.00 baseline=3.34 k_trans=1 E_min=87.1 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.43 E_pts=3.43 |
| Ballard | DEF | SUN | 5.0 | 4.03 | 18.83 | HIGH | 2.2 | bench 2 | prior 2144m raw_p90=4.87 c=1.00 baseline=3.78 k_trans=1 E_min=74.5 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.03 E_pts=4.03 |
| Calafiori | DEF | ARS | 5.5 | 5.09 | 23.78 | HIGH | 2.5 | XI | prior 1697m raw_p90=5.78 c=1.00 baseline=3.78 k_trans=1 E_min=79.2 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=5.09 E_pts=5.09 |
| Gabriel | DEF | ARS | 8.0 | 6.62 | 30.94 | HIGH | 4 | XI | prior 2750m raw_p90=6.84 c=1.00 baseline=3.78 k_trans=1 E_min=87.1 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=6.62 E_pts=6.62 |
| Maguire | DEF | MUN | 5.0 | 4.06 | 19.79 | HIGH | 2.2 | XI | prior 1649m raw_p90=4.91 c=1.00 baseline=3.78 k_trans=1 E_min=74.3 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.06 E_pts=4.06 |
| Muñoz | DEF | CRY | 5.5 | 3.93 | 23.71 | HIGH | 2.5 | bench 3 | prior 2400m raw_p90=5.10 c=1.00 baseline=3.78 k_trans=1 E_min=90.0 FDR=3 f=0.77 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.93 E_pts=3.93 |
| B.Fernandes | MID | MUN | 12.0 | 6.9 | 35.05 | HIGH | 4 | XI | prior 3065m raw_p90=6.90 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=6.90 E_pts=6.90 |
| E.Le Fée | MID | SUN | 6.0 | 4.14 | 20.36 | HIGH | 2.1 | bench 1 | prior 2930m raw_p90=4.52 c=1.00 baseline=4.29 k_trans=1 E_min=82.5 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.14 E_pts=4.14 |
| Gibbs-White | MID | NFO | 8.0 | 5.16 | 25.34 | HIGH | 2.8 | XI | prior 3101m raw_p90=5.46 c=1.00 baseline=4.29 k_trans=1 E_min=85.1 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=5.16 E_pts=5.16 |
| Mbeumo | MID | MUN | 8.0 | 4.79 | 24.34 | HIGH | 2.8 | XI | prior 2611m raw_p90=5.10 c=1.00 baseline=4.29 k_trans=1 E_min=84.5 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.79 E_pts=4.79 |
| Rice | MID | ARS | 7.5 | 5.35 | 26.29 | HIGH | 2.6 | XI | prior 3093m raw_p90=5.35 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=5.35 E_pts=5.35 |
| Calvert-Lewin | FWD | LEE | 6.0 | 3.37 | 19.53 | HIGH | 2 | XI | prior 2721m raw_p90=4.70 c=1.00 baseline=4.78 k_trans=1 E_min=79.4 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.37 E_pts=3.37 |
| Igor Jesus | FWD | NFO | 6.0 | 3.39 | 16.63 | HIGH | 2 | XI | prior 2293m raw_p90=4.47 c=1.00 baseline=4.78 k_trans=1 E_min=68.1 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.39 E_pts=3.39 |
| João Pedro | FWD | CHE | 7.5 | 4.31 | 26.01 | HIGH | 2.3 | XI | prior 2658m raw_p90=5.99 c=1.00 baseline=4.78 k_trans=1 E_min=79.7 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.31 E_pts=4.31 |

Best XI (3-4-3): Roefs, Calafiori, Gabriel, Maguire, B.Fernandes, Gibbs-White, Mbeumo, Rice, Calvert-Lewin, Igor Jesus, João Pedro.

Bench order (GW1 EP; GK last among remaining): E.Le Fée, Ballard, Muñoz, Sels.

## Long-term 15

GK £11.0m · DEF £31.0m · MID £38.5m · FWD £19.5m. Clubs with 2+: ARS×3 (3-of-club), EVE×2, LEE×2, MCI×2.

Fixture cliff: Roefs (GW4 FDR4, GW5 FDR5); Guéhi (GW4 FDR4, GW6 FDR4); Semenyo (GW4 FDR4, GW6 FDR4)

| Player | Pos | Club | Price | E GW1 | E GW1–6 | Conf | ep_next | XI / bench | Audit (GW1) |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| Raya | GK | ARS | 6.0 | 4.38 | 20.05 | HIGH | 4 | XI | prior 3330m raw_p90=4.38 c=1.00 baseline=3.34 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.38 E_pts=4.38 |
| Roefs | GK | SUN | 5.0 | 3.89 | 17.77 | HIGH | 2.6 | bench 4 | prior 3150m raw_p90=3.89 c=1.00 baseline=3.34 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.89 E_pts=3.89 |
| Calafiori | DEF | ARS | 5.5 | 5.09 | 23.78 | HIGH | 2.5 | XI | prior 1697m raw_p90=5.78 c=1.00 baseline=3.78 k_trans=1 E_min=79.2 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=5.09 E_pts=5.09 |
| Gabriel | DEF | ARS | 8.0 | 6.62 | 30.94 | HIGH | 4 | XI | prior 2750m raw_p90=6.84 c=1.00 baseline=3.78 k_trans=1 E_min=87.1 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=6.62 E_pts=6.62 |
| Guéhi | DEF | MCI | 6.0 | 3.94 | 23.9 | HIGH | 2.8 | XI | prior 3150m raw_p90=5.11 c=1.00 baseline=3.78 k_trans=1 E_min=90.0 FDR=3 f=0.77 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.94 E_pts=3.94 |
| Muñoz | DEF | CRY | 5.5 | 3.93 | 23.71 | HIGH | 2.5 | bench 1 | prior 2400m raw_p90=5.10 c=1.00 baseline=3.78 k_trans=1 E_min=90.0 FDR=3 f=0.77 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.93 E_pts=3.93 |
| Tarkowski | DEF | EVE | 6.0 | 3.54 | 22.41 | HIGH | 2.8 | bench 2 | prior 3330m raw_p90=4.59 c=1.00 baseline=3.78 k_trans=1 E_min=90.0 FDR=3 f=0.77 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.54 E_pts=3.54 |
| B.Fernandes | MID | MUN | 12.0 | 6.9 | 35.05 | HIGH | 4 | XI | prior 3065m raw_p90=6.90 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=2 f=1.00 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=6.90 E_pts=6.90 |
| Dewsbury-Hall | MID | EVE | 6.5 | 4.06 | 25.41 | HIGH | 2.3 | XI | prior 2629m raw_p90=5.17 c=1.00 baseline=4.29 k_trans=1 E_min=87.1 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.06 E_pts=4.06 |
| Groß | MID | BHA | 5.5 | 3.48 | 21.07 | HIGH | 2 | bench 3 | prior 1636m raw_p90=4.29 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.48 E_pts=3.48 |
| Semenyo | MID | MCI | 8.5 | 4.61 | 27.89 | HIGH | 2.9 | XI | prior 3200m raw_p90=5.68 c=1.00 baseline=4.29 k_trans=1 E_min=90.0 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.61 E_pts=4.61 |
| Stach | MID | LEE | 6.0 | 4.08 | 23.68 | HIGH | 2.1 | XI | prior 2369m raw_p90=5.20 c=1.00 baseline=4.29 k_trans=1 E_min=86.9 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.08 E_pts=4.08 |
| Calvert-Lewin | FWD | LEE | 6.0 | 3.37 | 19.53 | HIGH | 2 | XI | prior 2721m raw_p90=4.70 c=1.00 baseline=4.78 k_trans=1 E_min=79.4 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=3.37 E_pts=3.37 |
| João Pedro | FWD | CHE | 7.5 | 4.31 | 26.01 | HIGH | 2.3 | XI | prior 2658m raw_p90=5.99 c=1.00 baseline=4.78 k_trans=1 E_min=79.7 FDR=3 f=0.81 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=4.31 E_pts=4.31 |
| Woltemade | FWD | NEW | 6.0 | 2.4 | 18.94 | HIGH | 2 | XI | prior 1896m raw_p90=5.13 c=1.00 baseline=4.78 k_trans=1 E_min=65.5 FDR=4 f=0.64 m_sem=1.00 start=— change=— unreviewed m_fit=1.00 rate=2.40 E_pts=2.40 |

Best XI (3-4-3): Raya, Calafiori, Gabriel, Guéhi, B.Fernandes, Dewsbury-Hall, Semenyo, Stach, Calvert-Lewin, João Pedro, Woltemade.

Bench order (GW1 EP; GK last among remaining): Muñoz, Tarkowski, Groß, Roefs.

## Limitation

GW2–GW6 projections do **not** condition on post-GW1 events (injuries, price changes, realised minutes). They reuse the same as-of-GW0 rates with a different FDR. Edit minutes evidence at `/gw0-flags`, then re-solve.

## Transfer flexibility (v1 exposure only)

Remaining budget, spend by line, 3-of-club flags, and fixture-cliff names are shown above. A future ticket can add a multi-week transfer-path MILP (hits, price changes, chip windows). That model is **not** in this phase.

## How to rerun

```bash
node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"
npm install
npm test
npm run gw0:phase3
```

Open `/gw0` in the PWA to inspect the same two squads in the browser.
