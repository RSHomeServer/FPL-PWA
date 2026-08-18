# FPL PWA — GW0 Starting Squad Projection & Optimisation

**Status:** Modelling plan (source of truth). Phase 0 validation is documented in `docs/gw0-phase-0-validation.md`. Later phases are sequential and not ticketed yet.

**Immediate product question:**

> Given the information available before the 2026/27 GW1 deadline, which 15-player squads are reasonable candidates for my starting team, and why?

This document is the source of truth for how that system should work. It is written so a reviewer can answer:

> I understand exactly how this model arrives at its numbers, what assumptions it makes, what evidence supports those assumptions, and what I would be agreeing to build if I approve the implementation.

---

## How to read this document

| Section | Purpose |
| --- | --- |
| [1. Executive summary](#1-executive-summary) | What we are building and the core decisions |
| [2. Recommended GW0 modelling architecture](#2-recommended-gw0-modelling-architecture) | Pipeline and boundaries |
| [3. Data sources](#3-data-sources) | Every input, season coverage, look-ahead safety |
| [4. Metric catalogue](#4-metric-catalogue) | Named metrics with formulas |
| [5. Statistical models](#5-statistical-models) | Shrinkage, event model, team strength (including future Poisson) |
| [6. Expected-minutes methodology](#6-expected-minutes-methodology) | Task B |
| [7. Player-performance methodology](#7-player-performance-methodology) | Task A |
| [8. Team-strength persistence](#8-team-strength-persistence) | Task D — not a GW0 input |
| [9. Fixture methodology](#9-fixture-methodology) | Task E |
| [10. Uncertainty methodology](#10-uncertainty-methodology) | Task F |
| [11. GW1–GW6 projection methodology](#11-gw1gw6-projection-methodology) | Task G |
| [12. Historical validation methodology](#12-historical-validation-methodology) | Task H — Phase 0 executes this |
| [13. Semantic / external research methodology](#13-semantic--external-research-methodology) | Task I |
| [14. LP formulation](#14-lp-formulation) | Task J |
| [15. Short-term / long-term / balanced objectives](#15-short-term--long-term--balanced-objectives) | Multiple “best” squads |
| [16. Known limitations](#16-known-limitations) | What the model cannot know |
| [17. Example 2026/27 projections and squads](#17-example-202627-projections-and-squads) | Illustrative only until Phase 0/1 run |
| [18. Phased implementation plan](#18-phased-implementation-plan) | Sequential tickets; Phase 0 created idle |

Keep these concepts separate throughout:

| Concept | Meaning |
| --- | --- |
| **Price** | What FPL charges (`now_cost` in tenths of a million) |
| **Expected contribution** | Expected FPL points |
| **Value** | Expected contribution relative to price / opportunity cost (diagnostic only) |

The optimiser maximises expected contribution subject to FPL constraints. Price enters through the budget constraint. `expected points / £m` may be displayed; it is not the optimisation objective.

---

## 1. Executive summary

### What the proposed model does

A layered, explainable **as-of-GW0** pipeline:

```text
2025/26 vaastav history  ─┐
Official FPL GW0 API     ─┼→ Player baseline rates → Minutes model → Fixture adjustment
Structured external flags─┘         ↓                      ↓              ↓
                              GW1–GW6 point projections (independent, as-of-GW0)
                                         ↓
                              Quantitative funnel → Targeted external review
                                         ↓
                              MILP squad optimiser (3 objectives)
                                         ↓
                              Candidate squads + audit trail
```

It does **not** claim to predict GW1 perfectly. It constructs a transparent approximation that can be backtested, compared with intuition and with FPL’s own `ep_next`, and improved after each real gameweek.

### Core decisions

| Decision | Recommendation | Evidence / reason |
| --- | --- | --- |
| **Performance baseline** | **Approach A** (position-aware shrunk FPL points/90 from 2025/26) as primary; **Approach B** (event-derived EP/90) as diagnostic, optional blend | Within-season next-GW RMSE: raw/event ≈ 2.5–3.0 pts; xG-only attack rate ≈ 3.3; vaastav `xP` r ≈ 0.52. xG is not automatically better. |
| **Minutes** | Prior-season **start rate × 90**, shrunk for small samples; structured flags adjust minutes multiplicatively | Naive start-rate RMSE ≈ 28 mins/GW. Full `P(start)×E[min\|start] + P(sub)×E[min\|sub]` deferred until it beats this. |
| **Cross-season trust** | Use 2025/26 for returning players (join on `code`); discount transfers; newcomers use positional baseline | 2023/24→2024/25 p90: all r ≈ 0.55, same club ≈ 0.67, transferred ≈ 0.45. 2025/26→2026/27 code overlap ≈ 457 / 567. |
| **Team strength** | **Not a GW0 input.** FDR-based fixture factors only. Simple goals-for/against averages are too weak, especially on partial seasons. | Notebook attack rating persistence 2023/24→2024/25 r ≈ 0.25. Team goals/game r ranged from −0.12 to 0.70 across six transitions. |
| **Future team strength** | Opponent-adjusted Poisson (or similar) as a **research task**, evaluated out of sample against simple GPG, opponent-adjusted goals, opponent-adjusted xG | See [§5.3](#53-team-strength--not-a-gw0-input). |
| **Fixtures** | Multiplicative FDR factors for v1 | 2024/25: FDR 1 → 2.18 goals scored; FDR 5 → 0.99. |
| **GW1–GW6** | Independent as-of-GW0 projections per GW (same rate prior, different fixture). Uncertainty may widen with horizon; do not invent decay of EP without backtest. | No state-transition model in v1. |
| **Optimiser** | Browser MILP; maximise expected GW points under FPL rules; three objectives | PuLP was imported in the notebook but never committed as a formulation. No backend. |
| **External / semantic flags** | Structured enums on a filtered candidate set, converted to documented multipliers. Never LLM-scored minutes or “player scores”. | Funnel: ~590 → ~180 LP pool, ~100 flagged for review. |
| **Betting odds** | Deferred | Not required for GW1. |
| **Live GW0 data** | Official FPL `bootstrap-static` + fixtures as the 2026/27 price/FDR/status source | Vaastav 2026/27 has `players_raw` + `fixtures`, no `merged_gw`. API: GW1 is next. |

### What this is not

- Not a black-box ML model
- Not a multi-week transfer or chip optimiser
- Not “one best squad”
- Not a claim that previous-season data is ground truth
- Not promotion of FPL logic into PWA-Base

---

## 2. Recommended GW0 modelling architecture

```text
Raw data
  ├─ vaastav 2025/26 merged_gw + players_raw
  └─ official API bootstrap-static + fixtures (2026/27)
        ↓
Normalisation (code-keyed players, tenths prices, positions)
        ↓
Player baseline (Approach A + Approach B diagnostics)
        ↓
Minutes model
        ↓
Fixture adjustment (FDR multiplicative factors)
        ↓
Expected GW points for g = 1..6
        ↓
Confidence (separate from expected points)
        ↓
Quantitative funnel (~180 players)
        ↓
Structured external flags on the uncertain subset
        ↓
Recompute minutes with documented multipliers
        ↓
MILP (short-term / long-term / balanced)
        ↓
Best XI heuristic + bench order
        ↓
UI: candidate squads + per-player audit
```

**Keep FPL domain in this repo** (`src/analysis/*`, `src/optimiser/*` later). Do not put it in PWA-Base.

**As-of-GW0 rule:** for each future GW, calculate what we currently expect as of the GW1 deadline. Do not simulate every possible GW1 injury/transfer/performance state into GW2.

After each real gameweek, the same pipeline can be recalculated with newly available information. That is a later in-season loop, not v1.

### Existing application to reuse

| Already in the app | GW0 use |
| --- | --- |
| Vaastav CDN ingest + Dexie | Historical 2025/26 rates |
| `src/data/types.ts` | Players, teams, fixtures, per-GW performances |
| `src/data/scoring.ts` | Official FPL scoring weights |
| `valueTenths` from `merged_gw.value` | Historical opening-price proxy via `now_cost - cost_change_start` |
| `fplLiveSource.ts` stub | Implement official API for GW0 snapshot |
| Explorer UI | Later bind projections; do not redesign the app first |

Notebook concepts: reuse scoring intuition and the *idea* of constrained squad optimisation. Do **not** reuse rolling form (no current-season history at GW0). Do **not** reuse simple team attack/defence ratings as a GW0 input.

---

## 3. Data sources

### 3.1 Vaastav historical (jsDelivr CDN)

Ingested today via `src/data/ingest.ts` / `cdn.ts`.

Base URL: `https://cdn.jsdelivr.net/gh/vaastav/Fantasy-Premier-League@master`

| File | Fields | Seasons | Pre-deadline safe? | Limitations |
| --- | --- | --- | --- | --- |
| `data/{season}/players_raw.csv` | `id`, `code`, `element_type`, `team`, `team_code`, `now_cost`, `cost_change_start`, `minutes`, `starts`, `total_points`, `points_per_game`, `form`, `selected_by_percent`, `expected_goals`, `expected_assists`, `status`, `news`, `chance_of_playing_this_round`, `ep_next` | 2016–17 through 2026–27 | **2025/26 yes** (completed). **2026/27 yes** as a GW0 snapshot | Element `id` changes each season. Cross-season key is **`code`**. |
| `data/{season}/gws/merged_gw.csv` | `element`, `round`/`GW`, `minutes`, `total_points`, `goals_scored`, `assists`, `clean_sheets`, `saves`, `bonus`, `bps`, `expected_goals`, `expected_assists`, `expected_goal_involvements`, `xP`, `starts`, `value`, `opponent_team`, `was_home`, `defensive_contribution` | Most seasons. **2026/27 missing** (checked) | Safe through the final GW of the prior season | `xP` / `starts` / DC missing on older seasons |
| `data/{season}/fixtures.csv` | `event`, `team_h`, `team_a`, `team_h_difficulty`, `team_a_difficulty`, scores, `finished` | Published seasons including 2026/27 (380 fixtures, 10 in GW1) | **2026/27 GW1–6 fixtures yes** | FDR is FPL’s rating, not independent truth |
| `data/{season}/teams.csv` | `id`, `code`, `strength_*`, names | When published | Yes | Promoted clubs have no prior PL row in the same form |

### 3.2 Official FPL API (to add for GW0)

Stub: `src/data/fplLiveSource.ts`.

| Endpoint | GW0 use | Pre-deadline safe? |
| --- | --- | --- |
| `GET https://fantasy.premierleague.com/api/bootstrap-static/` | Current prices, positions, teams, `ep_next`, `status`, `news`, `chance_of_playing_*` | **Yes** — canonical GW0 squad/pricing source |
| `GET https://fantasy.premierleague.com/api/fixtures/` | GW1–6 schedule and FDR | **Yes** |
| Per-event live | Not for GW0 | Look-ahead if used before the season starts |

Checked at modelling time: API reports GW1 as next; ~590 elements; `ep_next` populated.

### 3.3 Structured external evidence (not raw model scores)

| Source | Use | Pre-deadline safe? |
| --- | --- | --- |
| FPL `news`, `status`, `chance_of_playing_*` | Fitness / availability | Yes |
| Pre-season reporting | Role change, competition, new manager | Only after conversion to the enum schema in [§13](#13-semantic--external-research-methodology) |
| Curated manager-change list | Team-stability discount on **confidence**, not on EP unless validated | Yes if dated as-of deadline |

### 3.4 Explicitly not in the GW0 model

| Source | Reason |
| --- | --- |
| Betting odds | Future enhancement ([§18.5](#185-deferred-and-future)) |
| ML / TensorFlow / sklearn GBR | Brief forbids ML-first |
| Notebook rolling form | No current-season history at GW0 |
| Simple team GPG ratings | Weak, fixture-confounded; see [§5.3](#53-team-strength--not-a-gw0-input) |
| Social / ownership sentiment | Not validated |

---

## 4. Metric catalogue

FPL scoring used by Approach B (already in `src/data/scoring.ts`):

| Event | Points |
| --- | --- |
| Play 1–59 minutes | 1 |
| Play 60+ minutes | 2 |
| Goal | GK 10, DEF 6, MID 5, FWD 4 |
| Assist | 3 |
| Clean sheet (60+ minutes) | GK/DEF 4, MID 1, FWD 0 |
| Goals conceded (GK/DEF) | −1 per 2 |
| Saves (GK) | 1 per 3 |
| Penalty save / miss | +5 / −2 |
| Own goal | −2 |
| Yellow / red | −1 / −3 |
| Defensive contribution (2025/26+) | 2 if threshold met (DEF 10 CBI, MID/FWD 12 CBIT) |
| Bonus | 1–3 (high uncertainty at GW0) |

---

### M1 — `minutes_season`

**Definition:** Total minutes in the source season.

**Formula:** \(\sum_g \text{minutes}_{p,g}\)

**Inputs:** `merged_gw.minutes` (preferred) or `players_raw.minutes`.

**Why:** Sample size for shrinkage and confidence.

**Limitations:** Does not encode role change.

---

### M2 — `starts_rate`

**Definition:** Fraction of appearance gameweeks that were starts.

**Formula:** \(\text{starts} / \max(\text{appearance\_gws}, 1)\) where appearance GWs have minutes > 0.

**Inputs:** `merged_gw.starts`, `merged_gw.minutes`.

**Why:** Primary GW0 minutes prior.

**Limitations:** `starts` missing on very old seasons; pre-season role changes.

---

### M3 — `raw_p90`

**Definition:** Historical FPL points per 90.

**Formula:** \((\sum \text{total\_points} / \sum \text{minutes}) \times 90\), require \(\sum \text{minutes} \ge 90\).

**Inputs:** Prior-season `merged_gw`.

**Why:** Approach A base rate.

**Limitations:** Noisy for substitutes; confounded by last season’s fixtures and team.

---

### M4 — `pos_baseline_p90`

**Definition:** Position-pool mean p90 for players with `minutes_season ≥ 900`.

**Formula:** Mean of `raw_p90` within {GK, DEF, MID, FWD}. Implementation should use a 5% trimmed mean.

**Inputs:** Same season as M3.

**Why:** Shrinkage target.

**Limitations:** Pool still contains role outliers.

---

### M5 — `confidence_minutes`

**Definition:** Trust in the player-specific rate versus the positional baseline.

**Formula:** \(c = \min(1,\ \text{minutes\_season} / 900)\)

**Why:** 900 minutes is a full-ish starter sample (~10 ninety-minute matches). Phase 0 must compare 450 / 900 / 1800 and a smoother \(1 - e^{-m/600}\).

**Limitations:** Linear ramp is a choice, not a law. Do not treat 900 as sacred until Phase 0 says so.

---

### M6 — `adj_p90` (Approach A — primary rate)

**Formula:**

\[
\text{adj\_p90} = c \cdot \text{raw\_p90} + (1-c) \cdot \text{pos\_baseline\_p90}
\]

**Cross-season modifier:**

\[
\text{adj\_p90\_gw0} = \text{adj\_p90} \times k_{\text{trans}}
\]

| Situation | \(k_{\text{trans}}\) | Reason |
| --- | --- | --- |
| Same club (`team_code` match) | 1.00 | Highest persistence |
| Transferred between PL clubs | 0.75 | Placeholder from ~0.45 vs ~0.67 persistence ratio; **Phase 0 must refit** (see `docs/gw0-phase-0-validation.md`) |
| New to the PL (`code` absent in 2025/26) | treat \(c = 0\) (positional baseline only) | No PL rate |

---

### M7 — `event_ep90` (Approach B — diagnostic)

**Definition:** Expected points per 90 from per-event rates using official scoring weights.

Per-90 rates (minutes-weighted, prior season):

| Rate | Formula |
| --- | --- |
| `g90` | \(\sum \text{goals} / \text{minutes} \times 90\) |
| `a90` | \(\sum \text{assists} / \text{minutes} \times 90\) |
| `cs90` | \(\sum \text{clean\_sheets} / \text{minutes} \times 90\) |
| `sv90` | \(\sum \text{saves} / \text{minutes} \times 90\) (GK) |
| `gc90` | \(\sum \text{goals\_conceded} / \text{minutes} \times 90\) (GK/DEF) |
| `bonus90` | \(\sum \text{bonus} / \text{minutes} \times 90\) |

**Event EP/90 (rate part):**

```text
event_ep90 =
    g90 × pts_per_goal(pos)
  + a90 × 3
  + cs90 × cs_pts(pos)          # 4 GK/DEF, 1 MID, 0 FWD
  + sv90 / 3                    # GK
  + gc90 × (−0.5)               # −1 per 2 conceded, GK/DEF
  + bonus90
```

Appearance points are **not** in the per-90 rate; they are applied from expected minutes (M8) when forming GW points.

Shrink each event rate with the same \(c\) toward a positional event baseline.

**Why:** Explains *why* a player projects well (goals vs CS vs bonus).

**Limitations:** Bonus and clean sheets are opponent-dependent. Phase 0 found event reconstruction ≈ raw p90 in aggregate, not clearly superior. Keep as an audit column. Optional blend (only if Phase 0 prefers it):

\[
\text{final\_rate} = \alpha \cdot \text{adj\_p90} + (1-\alpha) \cdot \text{event\_ep90}
\]

Do not assume \(\alpha = 0.8\). Fit \(\alpha\) in Phase 0 or default to \(\alpha = 1\) (Approach A only).

---

### M8 — `E_minutes_gw`

**v1 (recommended):**

\[
E[\text{minutes}] = \mathrm{clamp}(0,\ 90,\ \text{starts\_rate}' \times 90 \times m_{\text{sem}} \times m_{\text{fitness}})
\]

`starts_rate'` is M2 shrunk toward the positional start-rate baseline when `minutes_season < 450`.

`m_fitness` from official API:

| Signal | \(m_{\text{fitness}}\) |
| --- | --- |
| `status = a`, chance 100 | 1.00 |
| chance 75 | 0.85 |
| chance 50 | 0.60 |
| chance 25 | 0.30 |
| `i` injured / `u` unavailable | 0.00 (exclude from LP unless overridden) |
| `d` doubtful | 0.70 default |

`m_sem`: [§13](#13-semantic--external-research-methodology). Default 1.0 when no review.

**Full conditional model (v2 candidate, not GW0 default):**

\[
E[\text{minutes}] = P(\text{start}) \cdot E[\min \mid \text{start}] + P(\text{sub}) \cdot E[\min \mid \text{sub}]
\]

Use this only if Phase 0 / later validation shows it beats start-rate × 90 for GW0→GW1 minutes error.

---

### M9 — `fixture_attack_factor`

**Definition:** Multiplicative adjustment on attacking contribution for GW \(g\).

**v1 lookup** (from 2024/25 team goals scored vs opponent FDR; Phase 0 refit is in `docs/gw0-phase-0-validation.md`):

| Opponent FDR | Mean goals scored (2024/25) | Normalised factor (FDR 2 = 1.00) |
| --- | --- | --- |
| 1 | 2.18 | 1.25 |
| 2 | 1.75 | 1.00 |
| 3 | 1.46 | 0.84 |
| 4 | 1.15 | 0.66 |
| 5 | 0.99 | 0.57 |

Home/away ±5% is optional and must be validated; do not ship it if Phase 0 does not support it.

**Why multiplicative:** keeps expected points non-negative and scales event rates rather than adding an arbitrary point bonus.

---

### M10 — `fixture_defense_factor`

For GK/DEF clean-sheet and conceded components, invert the same FDR table (easy CS fixture = opponent who is a weak FDR-as-attacker). Phase 0 should estimate CS probability vs FDR separately if the inverted-goals table is a poor CS proxy.

---

### M11 — `E_pts_gw(g)` — core projection

**Approach A (primary):**

\[
E[\text{pts}_{p,g}] = \frac{\text{adj\_p90\_gw0}}{90} \times E[\text{minutes}_{p,g}] \times f_{\text{fixture}}(g, \text{pos})
\]

Blended fixture factor:

| Position | \(f_{\text{fixture}}\) |
| --- | --- |
| FWD / MID | `f_attack` |
| DEF | `0.5 × f_attack + 0.5 × f_cs` (heuristic; Phase 0 may replace) |
| GK | `0.3 × f_attack + 0.7 × f_cs` (heuristic; Phase 0 may replace) |

**Approach B:** apply M9/M10 to the attacking vs defensive event groups separately, then add appearance points from M8.

This is **expected contribution**, not value.

---

### M12 — `EPPM` (diagnostic only)

\[
\text{EPPM} = E[\text{pts\_gw}] / (\text{now\_cost} / 10)
\]

Display only. Not the LP objective.

---

### M13 — `confidence`

Composite in \([0,1]\), **not multiplied into expected points**:

```text
confidence = min(c_minutes, c_external, c_team_stability) × horizon_factor(g)
```

| Component | Mapping |
| --- | --- |
| `c_minutes` | M5 |
| `c_external` | HIGH=1.0, MEDIUM=0.7, LOW=0.4 (from flag confidence) |
| `c_team_stability` | same manager & club 1.0; manager change 0.85; promoted / new-to-PL team 0.7 |

`horizon_factor(g)` must be fitted in validation or left at 1.0. Do **not** invent decay of expected points. If horizon decay is used, it applies to **confidence**, and only after Phase 0 (or a later validation ticket) shows GW2–6 error increasing.

**UI:** always show expected performance and confidence as two fields.

**Label rule (v1):** `LOW` if `minutes_season < 450` OR `m_sem < 0.8` OR new-to-PL.

---

## 5. Statistical models

### 5.1 Position-aware shrinkage (Approach A)

**Purpose:** Stabilise small-sample p90.

**Formulation:** M6.

**Parameter selection:** \(c\) reaches 1 at 900 minutes pending Phase 0 comparison.

**Why appropriate:** GW0 extrapolates across a summer of transfers; raw p90 for 90-minute samples is extreme.

**Alternatives:** raw p90; Bayesian hierarchical by position; James–Stein. Prefer the simple mixture unless Phase 0 shows a clear win.

**Validation:** historical GW0 protocol in [§12](#12-historical-validation-methodology).

---

### 5.2 Event-derived expected points (Approach B)

**Purpose:** Explainability and optional ensemble.

**Formulation:** M7 + official scoring.

**Validation:** Phase 0 compares RMSE / rank correlation of A vs B vs blend vs FPL `ep_next` / vaastav `xP` where available.

**Limitation:** Reconstructing points from the same events that produced `total_points` is partly tautological *within* a season; the test that matters is **next season GW1** (and next GW within season as a weaker proxy).

---

### 5.3 Team strength — not a GW0 input

#### Why the notebook formula is weak

The notebook’s `calculate_team_ratings` is:

\[
\text{attack}_t = \frac{\text{goals\_for}_t / \text{games}_t}{\text{league avg goals}}
\quad
\text{defence}_t = \frac{\text{goals\_against}_t / \text{games}_t}{\text{league avg goals}}
\]

This is a season-long average. It only “balances” when every team has faced a representative slate. **On a partial season, differing matchups skew the ratings:** a team that has played two top sides looks weaker than a team that has played the bottom three, even if their underlying strengths are similar.

Empirically, even *full-season* ratings persist poorly into the next season:

| Transition | Attack r | Defence r |
| --- | --- | --- |
| 2023/24 → 2024/25 | 0.25 | 0.29 |
| 2022/23 → 2023/24 | 0.59 | 0.29 |
| 2021/22 → 2022/23 | 0.02 | −0.11 |
| 2020/21 → 2021/22 | 0.70 | 0.56 |
| 2019/20 → 2020/21 | 0.49 | 0.34 |
| 2018/19 → 2019/20 | −0.12 | 0.11 |

Manager and squad turnover make last season’s team strength an unreliable 2026/27 prior. **GW0 therefore does not use these ratings.** Fixture difficulty in v1 comes from official FDR ([§9](#9-fixture-methodology)).

Simple GPG ratings may still be shown as a **context chart** on team pages. They are not an input to `E_pts_gw`.

#### Future: opponent-adjusted team strength

The notebook’s simple goals-for / goals-against averages can be retained as a baseline, but for a more robust team-strength model we should investigate an **opponent-adjusted statistical model**, such as a Poisson model.

The idea is to estimate each team’s underlying attacking and defensive strength jointly across the matches played, rather than treating raw goals per game as independent of opposition.

For example:

```text
Expected goals =
    league baseline
  × home advantage
  × attacking strength of Team A
  × defensive weakness of Team B
```

A Poisson model can estimate these attack/defence parameters from the observed scores while accounting for the quality of opponents faced.

This becomes particularly valuable **mid-season**, when teams have played different opponents and we only have partial-season data. Rather than waiting for a full season for fixture difficulty to balance out, we can continuously update the estimated attack/defence strengths as new matches arrive.

The model should eventually be evaluated against alternatives such as:

- simple goals-per-game ratings
- opponent-adjusted goals
- opponent-adjusted xG
- potentially more sophisticated models if justified

with **out-of-sample historical testing** determining whether the additional complexity actually improves prediction.

For the current GW0 model, this is a **research/validation task rather than an assumed input**, particularly because manager and squad changes may make last season’s team strength unreliable for 2026/27.

**Do not implement the Poisson model in Phase 0.** Phase 0 may record this as a deferred experiment in the validation report. A later sequential ticket can run the horse-race once in-season data exists or as a purely historical mid-season simulation.

---

### 5.4 FPL `ep_next` and vaastav `xP`

| Metric | Finding | Use |
| --- | --- | --- |
| vaastav `xP` vs actual GW points (2024/25, minutes > 0) | r ≈ 0.52, RMSE ≈ 2.59 | Reference column |
| FPL `ep_next` (2026/27 snapshot) | mean ≈ 1.80, max ≈ 4.0 | Show on player cards; **not** the LP objective (compressed, opaque) |

---

## 6. Expected-minutes methodology

1. Compute prior-season `starts_rate` (M2) and shrink if sample is small.
2. Convert to minutes with start-rate × 90 (v1).
3. Multiply by API fitness (`m_fitness`).
4. Multiply by structured external flags (`m_sem`) for the reviewed subset only.
5. Clamp to [0, 90]. Double GWs: if a player has two fixtures in a GW, sum two independent 90-minute caps (max 180). Detect doubles from the fixtures file.

**Cannot be inferred from history alone:** new manager, formation change, new signings, competition, injuries, suspensions, pre-season usage, loanees.

Those gaps are why [§13](#13-semantic--external-research-methodology) exists. Do **not** ask a language model for a minutes number.

---

## 7. Player-performance methodology

**Primary:** Approach A (`adj_p90_gw0`).

**Secondary:** Approach B as audit / optional blend after Phase 0.

**Do not** use raw P90 without shrinkage for low-minute players.

**Do not** assume xG/xA is superior. Preliminary within-season tests: xG-derived attacking rate RMSE worse than actual-points rate.

**Persistence (player, 450+ prior minutes, p90):**

| Transition | All r | Same club r | Transferred r |
| --- | --- | --- | --- |
| 2023/24 → 2024/25 | 0.55 | 0.67 | 0.45 |
| 2022/23 → 2023/24 | 0.53 | 0.51 | 0.61 |
| 2021/22 → 2022/23 | 0.48 | 0.36 | 0.52 |
| 2020/21 → 2021/22 | 0.58 | 0.62 | 0.53 |
| 2019/20 → 2020/21 | 0.55 | 0.54 | 0.55 |
| 2018/19 → 2019/20 | 0.65 | 0.70 | 0.62 |

**Implication:** trust same-club regulars most; discount transfers (refit \(k_{\text{trans}}\) in Phase 0); newcomers get the positional baseline.

**GW0→GW1 RMSE** (prior full season shrunk p90 × start-rate minutes, no fixture adj):

| Transition | RMSE (pts) | n |
| --- | --- | --- |
| 2023/24 → 2024/25 | 2.72 | 376 |
| 2022/23 → 2023/24 | 2.53 | 365 |
| 2021/22 → 2022/23 | 3.05 | 371 |
| 2020/21 → 2021/22 | 3.48 | 363 |

Honest band: **about 2.5–3.5 FPL points per player on GW1**. Phase 0 must reproduce and then test whether FDR adjustment improves this.

---

## 8. Team-strength persistence

Covered in [§5.3](#53-team-strength--not-a-gw0-input).

**GW0 decision:** exclude from the projection formula.

**Conditional persistence** (manager change, promoted/relegated, major turnover) is **not fully measured yet**. Phase 0 should, where data allows, split team GPG persistence by promoted/relegated vs remaining clubs. Manager-change labels are not in vaastav; do not invent them. If a curated list is added later, persistence can be re-estimated.

---

## 9. Fixture methodology

**v1 input:** official FPL FDR on 2026/27 fixtures (`team_h_difficulty` / `team_a_difficulty`).

**Why FDR over notebook team strength:** available at GW0, resets each season in FPL’s process, and 2024/25 goals vs FDR were monotonic.

**Why not assume FDR is optimal:** it is coarse (five buckets) and not calibrated to FPL points. Phase 0 must:

1. Refit M9/M10 on at least three seasons.
2. Compare FDR factors vs a “no fixture adjustment” baseline on GW0→GW1 and GW1–6 RMSE / rank correlation.
3. If FDR does not improve player-point prediction, ship **no fixture multiplier** (factor = 1) rather than an unhelpful adjustment.

**Formulation:** multiplicative ([§4 M9–M11](#m9--fixture_attack_factor)). Additive point bumps are rejected for v1 (can drive EP negative or double-count appearance points).

**Horizons:** compute `E_pts` separately for each of GW1…GW6 from that GW’s fixtures. Report GW1, GW1–3 sum, and GW1–6 sum as views, not as three different rate models.

---

## 10. Uncertainty methodology

Uncertainty is a first-class output.

Sources (documented, not arbitrary):

| Factor | How it enters |
| --- | --- |
| Sample size | M5 / `c_minutes` |
| Minutes / role flags | `c_external`, `m_sem` |
| Transfer / new-to-PL | \(k_{\text{trans}}\), LOW confidence |
| Promoted club | `c_team_stability` |
| Injury | `m_fitness`; LOW if doubtful |
| Horizon | `horizon_factor` only if validated |

**Do not** create a 0–100 “confidence %” that is not a function of the above.

Output shape (implementation later):

```ts
{
  expectedPoints: number
  confidence: number // 0–1
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW'
  drivers: string[]  // e.g. "Transferred club", "212 prior minutes"
}
```

---

## 11. GW1–GW6 projection methodology

For each candidate player, produce independent pre-deadline projections:

```text
          GW1   GW2   GW3   GW4   GW5   GW6
Player X  E1    E2    E3    E4    E5    E6
```

Each \(E_g =\) M11 using that GW’s fixture(s).

**Limitation (must appear in the UI):**

> GW2–GW6 projections do not condition on unknown future events that may occur after GW1.

**Horizon weights** for the balanced LP objective are **not** to be invented. Phase 0 may grid-search weights that minimise historical GW1–6 regret. If the search is inconclusive, use equal weights on GW1–6 for the long-term objective and GW1-only for the short-term objective; introduce a balanced objective only with fitted weights.

Placeholder weights from the discovery chat (`0.35, 0.20, …`) are **withdrawn** until Phase 0 fits them.

---

## 12. Historical validation methodology

This is **Phase 0**. Essential. No look-ahead.

### Protocol

For each target season \(S\) in `{2018/19 … 2024/25}` where prior-season `merged_gw` exists:

1. **As-of data:** only season \(S-1\) performances and players. Opening price proxy for \(S\): `now_cost - cost_change_start` on \(S\) `players_raw` (end-of-season file; this is imperfect — state the bias). Do **not** use \(S\) `merged_gw` except as the *outcome* to score against.
2. Join players \(S-1\) → \(S\) on `code`.
3. Compute M2–M7 on \(S-1\).
4. Project GW1–GW6 of \(S\) using \(S\) fixtures (schedule is known before GW1).
5. Compare to actual \(S\) `merged_gw` rows.

### Metrics

| Target | Measure |
| --- | --- |
| Player GW points | RMSE, MAE, Spearman rank correlation |
| Minutes | RMSE |
| Rankings | Overlap of projected top 50 vs actual top 50 by GW1 points and by GW1–6 points |
| Fixture adj | RMSE with vs without FDR factors |
| Approach A vs B vs blend | Same metrics; pick a default |
| Shrinkage \(c\) | 450 vs 900 vs 1800 vs exponential |
| \(k_{\text{trans}}\) | Grid around 0.75 |

Squad-level LP validation is **out of Phase 0** (needs the optimiser). Phase 0 may still report: mean actual GW1 points of the 15 highest projected players under FPL constraints **ignored** vs a naive baseline — labelled as an unconstrained ranking diagnostic, not a legal squad.

### Cannot validate historically

- 2026/27-specific news flags
- Exact opening-day injury lists for old seasons in structured form
- Semantic review quality
- Poisson mid-season team strength (deferred experiment)

If a metric cannot be evaluated, say so in the Phase 0 report.

---

## 13. Semantic / external research methodology

**Principle:** quantitative first. External review only where history is silent or unreliable. Never produce an arbitrary expected-minutes number from a language model.

### Funnel (thresholds are proposals; Phase 0 may retune counts, not the idea)

```text
All selectable players (~590)
    ↓ exclude unavailable / cannot select
~420
    ↓ quantitative: E_pts_gw1 ≥ position floor
                   OR EPPM top 60%
                   OR prior minutes share ≥ 20% of position
~180  → LP pool
    ↓ auto-flag: new club, <450 PL minutes, doubtful, new signing, promoted club
~100  → structured review
```

### Schema

```ts
type RoleEvidence = {
  startingLikelihood: 'HIGH' | 'MEDIUM' | 'LOW'
  roleContinuity: 'HIGH' | 'MEDIUM' | 'LOW'
  competitionForPlace: 'HIGH' | 'MEDIUM' | 'LOW'
  fitnessConcern: 'NONE' | 'MEDIUM' | 'HIGH'
  roleChange: 'NONE' | 'MINOR' | 'MAJOR'
  evidenceNotes: string
  sources: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}
```

### Documented numerical mapping

| `startingLikelihood` | \(m_{\text{sem}}\) |
| --- | --- |
| HIGH | 1.00 |
| MEDIUM | 0.85 |
| LOW | 0.55 |

| `roleChange` | extra multiplier |
| --- | --- |
| NONE | 1.00 |
| MINOR | 0.90 |
| MAJOR | 0.75 |

Fitness still comes from the API (`m_fitness`), not from restating `fitnessConcern` unless the API is empty.

**Feasibility:** ~100 targeted reviews before GW1 is realistic; 590 is not.

**Phase 0 does not perform 2026/27 player reviews.** It only keeps the funnel design consistent with however many players pass the quantitative filters on historical seasons.

---

## 14. LP formulation

**Architecture:** browser MILP (HiGHS WASM preferred, GLPK.js fallback). PuLP stays available for offline research scripts if useful; it is not the PWA runtime.

**Decision variables:** \(x_p \in \{0,1\}\) — player \(p\) in the 15-man squad.

**Constraints:**

```text
Σ x_p = 15
Σ x_p × now_cost_p ≤ 1000          # tenths → £100.0m
Σ_{p in club t} x_p ≤ 3            # for all clubs
Σ_{p in GK}  x_p = 2
Σ_{p in DEF} x_p = 5
Σ_{p in MID} x_p = 5
Σ_{p in FWD} x_p = 3
x_p = 0 if m_fitness = 0
```

**Objectives:** [§15](#15-short-term--long-term--balanced-objectives).

**Best XI** given a 15: binary \(y_p \le x_p\), \(\sum y_p = 11\), legal formation. v1 may lock one default formation (e.g. 3-4-3) with a later toggle.

**Bench order:** sort non-XI by expected points with GK-on-bench rules; heuristic, not MILP in v1.

**Captain / chips / transfer-state:** deferred. Do not block the first optimiser.

**Transfer flexibility in v1 (no extra optimiser):** show remaining budget, price structure, club concentration, and a “fixture cliff” flag (FDR 4–5 clustered in GW4–6). Document a future transfer-path model; do not build it yet.

---

## 15. Short-term / long-term / balanced objectives

There is no single objectively best starting squad.

| Objective | Formula | Intent |
| --- | --- | --- |
| **Short-term** | \(\max \sum x_p E[\text{pts}_{p,1}]\) | Best GW1 |
| **Long-term** | \(\max \sum x_p \sum_{g=1}^{6} E[\text{pts}_{p,g}]\) | Opening fixture run |
| **Balanced** | \(\max \sum x_p \sum_{g=1}^{6} w_g E[\text{pts}_{p,g}]\) | Only if \(w_g\) are fitted |

How to validate weights later: grid-search on historical GW0 simulations, minimise GW1–6 regret versus a hindsight legal squad (or versus the best projected squad’s realised points). If inconclusive, ship short-term and long-term only.

Future optional objectives (not v1): conservative (max confidence), differential (low ownership), transfer-flexible.

---

## 16. Known limitations

1. GW0 has no 2026/27 performance — all rates are priors.
2. Bonus points are barely predictable pre-season.
3. New signings and promoted-club players have weak priors.
4. External flags are not historically backtestable in structured form.
5. GW2–GW6 ignore the post-GW1 world.
6. Simple team strength is fixture-confounded and persists poorly; Poisson is future work.
7. Historical opening prices are proxied; 2026/27 uses live `now_cost`.
8. No captain, chips, or multi-week transfers in v1.
9. FPL `ep_next` is shown, not trusted as the objective.
10. Double gameweeks and blank gameweeks must be read from fixtures; do not assume 10 matches every GW.

---

## 17. Example 2026/27 projections and squads

**These numbers are illustrative of shape, not a recommendation.** Phase 0/1 must replace them with reproducible outputs from the metric engine.

| Player type | Prior | Confidence | What the audit should say |
| --- | --- | --- | --- |
| Same-club 900+ min premium | Approach A rate × ~85–90 mins × FDR factor | HIGH | “2025/26 p90 after shrinkage; same club; starter rate” |
| Same-club 4.5–6.5m starter | Same | MED–HIGH | Often the value diagnostic (EPPM) looks strong; LP still maximises EP |
| Transferred PL regular | Rate × 0.75 (until refit) | MEDIUM | “Club change discount; minutes less certain” |
| Promoted-club starter | Positional baseline | LOW | “No PL minutes; FDR still applied” |
| Injured (`status = i`) | EP 0; excluded | — | API availability |

**Squad examples (structure only, not a picked team):**

- **Short-term:** spend on GW1 FDR 1–2 attackers and CS-friendly defence; cheap bench.
- **Long-term:** fewer one-week punts; avoid a GW4–6 FDR 5 cluster at the same position.
- **Overlap:** expect ~9–12 shared players; the UI should show the diffs and the EP trade-off.

A real 15-man list is **not** produced in this document on purpose: printing names without the Phase 0/1 engine would be a vibe squad.

---

## 18. Phased implementation plan

Phases are **sequential**. Do not start Phase \(n+1\) until Phase \(n\) is merged (or the human explicitly reorders).

Each ticket below is sized for one Executor, one feature branch.

### Phase 0 — Validation harness

Safe before GW1. No product UI. No optimiser. No Poisson team-strength implementation.

| ID | Objective | Scope | Expected output | Acceptance | Data structures? | UI? | External data? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **0.0** | Land this modelling plan in git | `docs/gw0-modelling-plan.md` | File on the feature branch | Human can read the plan in the repo | Docs only | No | No |
| **0.1** | Reproducible GW0 backtest | TS (preferred) or Node script using existing parse/CDN helpers | `docs/gw0-phase-0-validation.md` + runnable script | Protocol in §12 runs for ≥4 season transitions without look-ahead; tables for RMSE/MAE/Spearman | Maybe `src/analysis/*` helpers | No | Vaastav CDN only |
| **0.2** | Approach A vs B | Same harness | Report section + recommended default (A, B, or fitted blend) | Side-by-side metrics; shrinkage parameter comparison | Same | No | No extra |
| **0.3** | FDR calibration | Fit M9/M10 on ≥3 seasons; test vs no-adjustment | Factor table in the validation doc; recommendation to use or drop FDR | Monotonicity check; player-point RMSE with vs without | Same | No | Fixtures CSV |

**Must not:** implement MILP, GW0 UI, official API ingest (unless needed to read 2026/27 prices for a *prototype table* — prefer not), semantic reviews, Poisson team model, ML.

**Tests:** unit tests for any shared metric functions (golden values from a hand-calculated player-season). Script should be deterministic given cached CSVs.

**GW1-safe:** yes.

---

### Phase 1 — Analysis core (not created yet)

| ID | Objective | Depends on | UI? | External? |
| --- | --- | --- | --- | --- |
| 1.1 | Official FPL GW0 ingest (`FplLiveSource` + Dexie) | Phase 0 merged | No | Official API |
| 1.2 | Cross-season join on `code` | 1.1 | No | No |
| 1.3 | Metric engine M1–M13 as pure functions | 1.2 + Phase 0 defaults | No | No |
| 1.4 | GW1–6 projection matrix | 1.3 | No | Fixtures |
| 1.5 | Confidence + audit strings | 1.4 | No | No |

Acceptance for the phase: every `E_pts_gw` is reconstructable from the audit object; golden tests; no look-ahead fields.

---

### Phase 2 — Structured flags (not created yet)

| ID | Objective |
| --- | --- |
| 2.1 | Schema + Dexie store |
| 2.2 | Quantitative funnel list |
| 2.3 | Review workflow applying M8 multipliers (human/assisted; enums only) |

---

### Phase 3 — Optimiser + squad UI (not created yet)

| ID | Objective |
| --- | --- |
| 3.1 | MILP library in the browser |
| 3.2 | 15-man constraints |
| 3.3 | Three objectives (balanced only if weights exist) |
| 3.4 | Best XI heuristic |
| 3.5 | `/gw0` (or similar) squad-builder UI with audit |

Minimum useful GW1 product: **Phase 1 + Phase 3**. Phase 2 can ship with all `m_sem = 1` if time is short.

---

### Phase 4 — Validation in-app / polish (not created yet)

Historical RMSE bands in the UI; `ep_next` comparison column; export.

---

### 18.5 Deferred and future

| Useful later | Interesting but unnecessary | Deliberately deferred |
| --- | --- | --- |
| In-season refresh of the same pipeline | Notebook club point-splits | Betting odds (API vs scrape; margin; player markets — not GW1) |
| Opponent-adjusted Poisson team strength horse-race | Breakout “score” | ML |
| Captain sub-MILP | | Transfer-path optimiser |
| Fitted balanced weights | | Backend |
| | | PWA-Base promotion |

**Breakout / value (exploratory, not a model input):** 2024/25 high pts/£m among 900+ minute players clustered in mid-price names (e.g. Mbeumo, Wood, Sels), not a reliable ultra-cheap rule. Do not add a breakout score. Optional later: flag “900+ mins, same club, ≤ £7.0m, top-quartile adj_p90”.

---

## 19. Recommended tickets

| Ticket | Status |
| --- | --- |
| Phase 0 — modelling doc + backtest + A vs B + FDR | On this branch; report in `docs/gw0-phase-0-validation.md` |
| Phase 1 — API ingest + metric engine + projections | Not created |
| Phase 2 — flags + funnel | Not created |
| Phase 3 — MILP + squad UI | Not created |
| Phase 4 — in-app validation | Not created |

Do not create later phases until Phase 0 is reviewed and merged, unless the human asks.

---

## 20. What you are agreeing to if you approve implementation

1. A **deterministic**, documented metric pipeline (not ML).
2. **2025/26 → 2026/27** priors with an explicit, Phase-0-refit transfer discount.
3. **FDR-based** fixture adjustment **only if** Phase 0 shows it helps; otherwise factor = 1.
4. **No** notebook-style GPG team ratings in the GW0 formula; Poisson opponent-adjusted strength is a later research ticket.
5. Structured external adjustments on a **filtered** set, mapped to documented multipliers.
6. A **browser MILP** producing more than one explainable squad.
7. **Uncertainty** shown separately from expected points.
8. Sequential delivery: validate, then engine, then flags, then optimiser/UI.

---

## Appendix A — Discovery measurements (provisional)

Run at modelling time against vaastav CDN. **Phase 0 must reproduce** rather than treat these as frozen truth.

- 2026/27 `players_raw`: 567 rows; status mix includes available / injured / doubtful; **no** `merged_gw`.
- 2026/27 fixtures: 380 rows, 10 in GW1.
- Official API: GW1 next, ~590 elements.
- FDR vs goals 2024/25: monotonic (see M9).
- `xP` vs points 2024/25: r ≈ 0.516, RMSE ≈ 2.59, n ≈ 11566 (minutes > 0).

## Appendix B — Notebook reuse map

| Notebook idea | GW0 |
| --- | --- |
| `calculate_team_ratings` (GPG) | Context only; not an input |
| Opponent-adjusted Poisson | Future research ([§5.3](#53-team-strength--not-a-gw0-input)) |
| GK save heuristic | Approach B GK component |
| Club point splits vs fixtures | Deferred; FDR covers v1 |
| PuLP import | Port constraints to browser MILP in Phase 3 |
| Live bootstrap | Phase 1 official source |
| Rolling form | Not applicable at GW0 |
| sklearn / TF | Not used |
