# GW0 Phase 0 — historical validation

Generated: 2026-08-18T09:56:38.407Z

This report is the Phase 0 output for `docs/gw0-modelling-plan.md` §12. It is produced by `npm run gw0:phase0`, which caches vaastav CSVs under `.cache/vaastav/` (not committed).

## Protocol

- Target seasons: every campaign from 2018/19 through 2025/26 where both $S$ and $S-1$ publish `merged_gw`.
- Features from season $S-1$ only. Season $S$ `merged_gw` is the outcome. Season $S$ fixtures are allowed (the schedule is known before GW1).
- Players joined on **`code`**, never season `id`.
- Core evaluation set: overlapping codes with **≥ 90 prior-season minutes** (raw p90 is defined). Players with 0 GW1 minutes count as 0 points.
- Opening-price proxy for $S$: `now_cost - cost_change_start` on $S$ `players_raw`. That file is an end-of-season snapshot, so the proxy can still embed in-season price path effects that a true GW0 chip would not have. It is **not** used in the RMSE tables below; it is recorded for later squad work.
- Minutes prior: start-rate × 90, shrunk toward the positional start-rate when prior minutes < 450. `starts` inferred from minutes ≥ 60 when the column is all zeros.
- No look-ahead: no $S$ performance rates, no Poisson team strength, no external flags, no language-model minutes.

Seasons loaded: 2017-18, 2018-19, 2019-20, 2020-21, 2021-22, 2022-23, 2023-24, 2024-25, 2025-26, 2026-27.

## Appendix A reproduction

| Check | Discovery | This run |
| --- | --- | --- |
| 2026/27 `players_raw` rows | 567 | 567 |
| 2026/27 fixtures | 380 | 380 |
| 2026/27 GW1 fixtures | 10 | 10 |
| 2024/25 `xP` vs points (minutes > 0) r | ≈ 0.516 | 0.516 |
| 2024/25 `xP` RMSE | ≈ 2.59 | 2.589 |
| 2024/25 `xP` n | ≈ 11566 | 11566 |

### 2024/25 goals scored vs opponent FDR

| FDR | Mean | n | Factor (FDR 2 = 1.00) |
| --- | --- | --- | --- |
| 1 | 2.184 | 76 | 1.245 |
| 2 | 1.754 | 114 | 1 |
| 3 | 1.459 | 342 | 0.832 |
| 4 | 1.151 | 152 | 0.656 |
| 5 | 0.987 | 76 | 0.563 |

## 0.1 — GW0 → GW1 baseline

Approach A, linear shrinkage $c=\min(1, m/900)$, $k_{\mathrm{trans}}=1$ (no transfer discount yet), no FDR.

| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2017-18 → 2018-19 | 372 | 3.145 | 2.547 | 0.306 | 50.621 | 24% | 40% |
| 2018-19 → 2019-20 | 358 | 2.996 | 2.445 | 0.327 | 47.823 | 28% | 42% |
| 2019-20 → 2020-21 | 378 | 2.621 | 1.808 | 0.517 | 41.014 | 26% | 34% |
| 2020-21 → 2021-22 | 371 | 3.086 | 2.535 | 0.224 | 51.3 | 30% | 38% |
| 2021-22 → 2022-23 | 377 | 2.786 | 2.367 | 0.358 | 50.274 | 32% | 42% |
| 2022-23 → 2023-24 | 377 | 2.473 | 1.773 | 0.321 | 39.612 | 24% | 30% |
| 2023-24 → 2024-25 | 383 | 2.703 | 2.262 | 0.337 | 46.933 | 34% | 38% |
| 2024-25 → 2025-26 | 376 | 2.85 | 2.326 | 0.261 | 48.367 | 16% | 24% |

Pooled (n-weighted): RMSE **2.83**, MAE 2.256, Spearman 0.332, minutes RMSE 46.97, top-50 GW1 overlap 26.8%, top-50 GW1–6 overlap 36% (n=2992).

Discovery §7 quoted RMSE 2.72 / 2.53 / 3.05 / 3.48 on 2023/24→2024/25 through 2020/21→2021/22 with n ≈ 363–376. Side-by-side on those four transitions:

| Transition | Discovery RMSE (n) | This run RMSE (n) |
| --- | --- | --- |
| 2020-21 → 2021-22 | 3.48 (363) | 3.086 (371) |
| 2021-22 → 2022-23 | 3.05 (371) | 2.786 (377) |
| 2022-23 → 2023-24 | 2.53 (365) | 2.473 (377) |
| 2023-24 → 2024-25 | 2.72 (376) | 2.703 (383) |

The estimator family matches. Remaining n/RMSE gaps are from the evaluation-set filter (≥90 prior minutes), start-rate shrinkage below 450 minutes, and inferred `starts` on older files — not from look-ahead.

### p90 persistence (prior minutes ≥ 450)

| Transition | All r | Same club r | Transferred r | n |
| --- | --- | --- | --- | --- |
| 2018-19 | 0.664 | NA | NA | 284 (same 0 / moved 0 / unknown 284) |
| 2019-20 | 0.648 | NA | NA | 278 (same 0 / moved 0 / unknown 278) |
| 2020-21 | 0.547 | 0.57 | 0.386 | 294 (same 267 / moved 27 / unknown 0) |
| 2021-22 | 0.581 | 0.625 | 0.414 | 300 (same 271 / moved 29 / unknown 0) |
| 2022-23 | 0.476 | 0.475 | 0.512 | 282 (same 242 / moved 40 / unknown 0) |
| 2023-24 | 0.532 | 0.536 | 0.498 | 276 (same 239 / moved 37 / unknown 0) |
| 2024-25 | 0.549 | 0.627 | 0.241 | 299 (same 256 / moved 43 / unknown 0) |
| 2025-26 | 0.384 | 0.405 | 0.318 | 284 (same 237 / moved 47 / unknown 0) |

### Team GPG persistence (remaining clubs only)

Promoted clubs are identified by `teams.csv` short name (then `code` when present). Manager-change labels are not in vaastav and were not invented. Seasons whose team files lack stable identifiers are reported as NA.

| Transition | Remaining-club GPG r | Promoted n |
| --- | --- | --- |
| 2018-19 | NA | 0 |
| 2019-20 | NA | 20 |
| 2020-21 | 0.797 | 3 |
| 2021-22 | 0.796 | 3 |
| 2022-23 | 0.561 | 3 |
| 2023-24 | 0.759 | 3 |
| 2024-25 | 0.728 | 3 |
| 2025-26 | 0.447 | 3 |

### Unconstrained ranking diagnostic (not a legal squad)

Mean actual GW1 points of the 15 highest projected players vs the 15 highest prior-season point totals. FPL constraints ignored.

| Transition | Projected top-15 actual GW1 | Prior-points top-15 actual GW1 |
| --- | --- | --- |
| 2018-19 | 3.733 | 3.6 |
| 2019-20 | 5.933 | 5.533 |
| 2020-21 | 5 | 4.267 |
| 2021-22 | 4.333 | 5.267 |
| 2022-23 | 4.667 | 3.533 |
| 2023-24 | 4.333 | 3.6 |
| 2024-25 | 4.267 | 5.067 |
| 2025-26 | 3.333 | 4.4 |

## 0.2 — Approach A vs B, shrinkage, $k_{\mathrm{trans}}$

### Shrinkage $c$

| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| linear/450 | 2992 | 2.839 | 2.262 | 0.329 | 46.97 | 25.8% | 34.5% |
| linear/900 | 2992 | 2.83 | 2.256 | 0.332 | 46.97 | 26.8% | 36% |
| linear/1800 | 2992 | 2.826 | 2.253 | 0.327 | 46.97 | 27.8% | 37% |
| 1-exp(-m/600) | 2992 | 2.828 | 2.256 | 0.33 | 46.97 | 26.8% | 36.5% |

Selected shrinkage: **linear/900**. The plan default (linear/900) is kept unless another candidate beats it by more than 0.02 pooled RMSE.

### Transfer discount $k_{\mathrm{trans}}$

Same-club players keep $k=1$. Grid applied only to club changes (team `code`, then short name). If club continuity cannot be determined, $k=1$ (unknown is not treated as a transfer). The 0.75 placeholder is kept unless another $k$ beats it by more than 0.02 pooled RMSE.

| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| k=0.5 | 2992 | 2.788 | 2.175 | 0.346 | 46.97 | 28.3% | 36.2% |
| k=0.6 | 2992 | 2.791 | 2.189 | 0.347 | 46.97 | 28.3% | 36.2% |
| k=0.7 | 2992 | 2.797 | 2.204 | 0.346 | 46.97 | 27.8% | 36% |
| k=0.75 | 2992 | 2.801 | 2.212 | 0.345 | 46.97 | 27.8% | 35.7% |
| k=0.8 | 2992 | 2.805 | 2.22 | 0.343 | 46.97 | 28% | 36.5% |
| k=0.9 | 2992 | 2.816 | 2.237 | 0.338 | 46.97 | 27% | 36.2% |
| k=1 | 2992 | 2.83 | 2.256 | 0.332 | 46.97 | 26.8% | 36% |

Selected $k_{\mathrm{trans}}$: **0.75**.

### Approach A, B, and blend $\alpha$

A = shrunk FPL points/90. B = event-derived EP/90 (official weights in `src/data/scoring.ts`) plus appearance points from expected minutes. Blend is $\alpha A + (1-\alpha) B$ at GW-point level. $\alpha=1$ is A only; $\alpha=0$ is B only. **0.8 was not assumed.**

| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B only | 2992 | 2.839 | 2.279 | 0.341 | 46.97 | 26.8% | 36.7% |
| blend α=0.2 | 2992 | 2.828 | 2.264 | 0.344 | 46.97 | 26.8% | 36.4% |
| blend α=0.4 | 2992 | 2.819 | 2.25 | 0.346 | 46.97 | 27.2% | 36.7% |
| blend α=0.6 | 2992 | 2.811 | 2.236 | 0.346 | 46.97 | 28% | 36.5% |
| blend α=0.8 | 2992 | 2.805 | 2.223 | 0.346 | 46.97 | 28.5% | 36% |
| A only | 2992 | 2.801 | 2.212 | 0.345 | 46.97 | 27.8% | 35.7% |

Selected default: **Approach A only (α = 1)**. Approach A is kept unless a blend or B beats it by more than 0.02 pooled RMSE.

## 0.3 — FDR calibration

Goals vs FDR fitted on 9 loaded historical seasons’ finished fixtures. Factors normalised so FDR 2 = 1.00. Clean-sheet probability fitted separately (M10). The inverted goals table is retained as a diagnostic, not the default CS model.

### Goals scored vs FDR (multi-season)

| FDR | Mean | n | Factor (FDR 2 = 1.00) |
| --- | --- | --- | --- |
| 1 | 2.158 | 114 | 1.255 |
| 2 | 1.719 | 2242 | 1 |
| 3 | 1.396 | 2033 | 0.812 |
| 4 | 1.106 | 1311 | 0.643 |
| 5 | 0.797 | 380 | 0.464 |

Monotone decreasing in FDR: **yes**.

### Clean-sheet rate vs FDR

| FDR | Mean | n | Factor (FDR 2 = 1.00) |
| --- | --- | --- | --- |
| 1 | 0.439 | 114 | 1.269 |
| 2 | 0.346 | 2242 | 1 |
| 3 | 0.252 | 2033 | 0.729 |
| 4 | 0.169 | 1311 | 0.49 |
| 5 | 0.071 | 380 | 0.206 |

### Player-point prediction with vs without FDR

| Set | n | RMSE | MAE | Spearman | Minutes RMSE | Top-50 GW1 | Top-50 GW1–6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| No FDR (factor = 1) | 2992 | 2.801 | 2.212 | 0.345 | 46.97 | 27.8% | 35.7% |
| FDR goals + CS tables | 2992 | 2.671 | 1.954 | 0.347 | 46.97 | 27.3% | 36.5% |
| FDR + home/away ±5% | 2992 | 2.673 | 1.955 | 0.345 | 46.97 | 27.6% | 37% |
| Approach B event-split FDR | 2992 | 2.779 | 2.17 | 0.35 | 46.97 | 25.5% | 32.9% |

### DEF / GK attack vs CS blend (only because FDR helped)

Plan heuristics are DEF 0.5 / GK 0.3 attack weight (rest CS). Compared with attack-only (1/1) and CS-only (0/0). A 0.02 RMSE bar applies; if the grid is flat, keep the heuristics.

| DEF attack weight | GK attack weight | RMSE | Spearman |
| --- | --- | --- | --- |
| 0.5 | 0.3 | 2.671 | 0.347 |
| 1 | 1 | 2.676 | 0.345 |
| 0 | 0 | 2.671 | 0.346 |

**FDR recommendation:** keep multiplicative FDR. FDR adjustment improved RMSE or Spearman enough to keep.

Home/away ±5% is not shipped unless it beats plain FDR in the table above.

## Horizon (GW1–6)

Expected points are **not** decayed with horizon. The table is RMSE of the independent as-of-GW0 projection for that GW against actual points.

| GW | RMSE |
| --- | --- |
| 1 | 2.677 |
| 2 | 2.807 |
| 3 | 2.646 |
| 4 | 2.81 |
| 5 | 2.58 |
| 6 | 2.757 |

| Equal-weight GW1–6 sum vs actual GW1–6 Spearman | 0.354 |
| GW1-only projection as a ranker of actual GW1–6 Spearman | 0.314 |

Ship short-term (GW1) and long-term (equal-weight GW1–6 sum) only. No fitted balanced w_g.

## Recommended GW0 defaults

| Knob | Value |
| --- | --- |
| Shrinkage | linear/900 |
| $k_{\mathrm{trans}}$ | 0.75 |
| Rate model | Approach A only (α = 1) |
| FDR | multiplicative tables above |
| Home/away ±5% | Off |
| DEF/GK blend | Plan heuristics (0.5 / 0.3) |
| Balanced LP $w_g$ | Not shipped |
| Poisson / GPG team strength | Not a GW0 input (unchanged) |

## What this run cannot validate

- 2026/27 news, injuries, and structured semantic flags
- Exact historical GW0 injury lists
- Legal 15-man squad LP quality (needs Phase 3)
- Opponent-adjusted Poisson team strength (deferred)

## How to rerun

```bash
node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"
npm install
npm test
npm run gw0:phase0
```

The harness writes this file again. Cached CSVs stay in `.cache/vaastav/`.
