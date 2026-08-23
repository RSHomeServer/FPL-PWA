# FPL PWA — Live weekly transfer decision support (discovery)

**Status:** Discovery complete for human review. No implementation tickets created via MCP.

**Branch:** `feature/fpl-live-transfer-discovery`

**Builds on:** `docs/gw0-modelling-plan.md` and merged GW0 phases 0–4 (`src/analysis/*`, `src/data/fplLiveSource.ts`, `/gw0` UI). This document does **not** replace Vaastav ingest or the GW0 pipeline; it extends the same metric engine and MILP stack toward in-season weekly decisions.

---

## Problem statement

**Users:** FPL managers using this PWA during the season.

**Outcome:** Given my **current squad**, bank, free transfers, and chip state, what are the best **multi-player transfer combinations** I can make this gameweek — accounting for expected performance, fixture outlook, budget, sell-on rules, and transfer hits — with explainable recommendations?

**Core constraint (from product brief):** The transfer optimiser must evaluate **simultaneous transfer sets** on **final squad legality**, not greedy single swap search.

---

## How to read this document

| Section | Topic |
| --- | --- |
| [1](#1-live-api-architecture) | Live API architecture |
| [2](#2-userteam-model) | User / team model |
| [3](#3-ev-model-in-season) | EV model (in-season) |
| [4](#4-team-strength) | Team strength |
| [5](#5-future-fixture-metric) | Future fixture metric |
| [6](#6-transfer-optimisation-milp) | Transfer optimisation (MILP) |
| [7](#7-transfer-penalties) | Transfer penalties |
| [8](#8-retention-model) | Retention model |
| [9](#9-strategy-types) | Strategy types |
| [10](#10-reachable-vs-theoretical-optimum) | Reachable vs theoretical optimum |
| [11](#11-recommendation-object) | Recommendation object |
| [12](#12-ui-architecture) | UI architecture |
| [13](#13-testing--validation) | Testing & validation |
| [14](#14-data-architecture) | Data architecture |
| [15](#15-implementation-ticket-plan) | Implementation ticket plan |
| [Appendix A](#appendix-a--api-investigation) | API investigation (tested endpoints) |

Keep separate throughout (GW0 plan §“How to read”):

| Concept | Meaning |
| --- | --- |
| **Price** | FPL `now_cost` (tenths of a million) |
| **Expected contribution** | Expected FPL points (EP) |
| **Value** | EP relative to price — diagnostic only, not the optimiser objective |

---

## Dependency graph

```text
FPL API investigation (Appendix A)
        ↓
Live data integration (extend fplLiveSource + manager endpoints)
        ↓
   ┌────┴────┐
Auto refresh   Manager / team state (Dexie user stores)
   └────┬────┘
        ↓
In-season EV model (extend metrics.ts / gw0Project.ts)
        ↓
Multi-transfer MILP (extend gw0Solver / gw0Squad LP)
        ↓
Recommendations + explanations
        ↓
Weekly decision UI (My Team → Transfer Assistant)
```

---

## 1. Live API architecture

### 1.1 What exists today

| Component | Location | Coverage |
| --- | --- | --- |
| Official bootstrap + fixtures | `src/data/fplLiveSource.ts` | `bootstrap-static`, `fixtures` |
| Browser CORS workaround | `vite.config.ts` `/fpl-api` proxy | Same-origin fetch in dev/preview/build SW |
| Dexie live cache | `liveMeta`, `livePlayers`, `liveTeams`, `liveFixtures`, `liveEvents` | 6h TTL (`CURRENT_SEASON_TTL_MS`) |
| Vaastav historical | `src/data/ingest.ts`, `cdn.ts`, `db.ts` | Prior-season rates for shrinkage |

Manager-specific endpoints are **not** implemented. `types.ts` reserves `FplSourceKind = 'user'` but marks it unused.

### 1.2 Endpoints to add (all verified — see Appendix A)

| Endpoint | Purpose | Refresh cadence | Cache |
| --- | --- | --- | --- |
| `GET /api/bootstrap-static/` | Prices, status, `ep_next`, chips meta, `game_settings`, events | 6h baseline; force on app focus if stale | Existing live stores |
| `GET /api/fixtures/` | Schedule, FDR, finished flags | 6h; shorter near deadline if needed | Existing |
| `GET /api/entry/{entry_id}/` | Manager summary: bank, squad value, current event | On login / “refresh my team”; 15–30 min during GW | New `userEntry` store |
| `GET /api/entry/{entry_id}/event/{gw}/picks/` | 15 picks, captain, chip, bench order, `entry_history` slice | Same as entry; after deadline for locked picks | New `userPicks` |
| `GET /api/entry/{entry_id}/history/` | Season `current[]`, `chips[]`, ranks, per-GW transfers & hits | Same as entry | New `userHistory` |
| `GET /api/entry/{entry_id}/transfers/` | Transfer audit trail (in/out element, event, time) | On demand / after refresh | Optional; helps sell-price reconstruction |
| `GET /api/event/{gw}/live/` | Live GW stats per element (`total_points`, minutes, bonus, xG…) | 1–5 min while `event-status` points pending | Memory + short Dexie optional |
| `GET /api/event-status/` | Whether bonus added / points finalised per day | 5 min during live GW | Memory |
| `GET /api/element-summary/{element_id}/` | Player fixture list + GW history + past seasons | 6h per player; on player drill-down | On-demand |
| `GET /api/dream-team/{event_id}/` | Official dream team (reference) | After GW finishes | Low priority |

**Not available:** There is **no** official JSON API to resolve a manager from **player code** or “team code” vanity URLs. Tested paths `/api/entry/by-player-code/{code}/`, `/api/entry/by-code/{code}/`, `/api/player/{code}/` → **404**. A numeric path `/api/entry/{n}/` is always **entry ID**, not player code (e.g. `/api/entry/154561/` returned a valid manager named “The Pride of Portchy”, unrelated to Raya’s player code 154561).

**Recommended identity model:** User supplies **FPL entry ID** (from browser URL `fantasy.premierleague.com/entry/{id}/event/...`). Optional local alias in Dexie. Do not rely on player-code lookup URLs.

### 1.3 Refresh orchestration

```text
App boot
  → loadOfficialLiveSnapshot()     [existing]
  → if entryId configured:
       refreshUserState(entryId)   [new: entry + picks + history in parallel]

Timer / visibility
  → live snapshot if stale (>6h) or user forces
  → user state if stale (>30m) or post-deadline
  → event live if current GW unfinished and tab visible (1–5m)

Failure
  → stale-while-revalidate for bootstrap (existing pattern in fplLiveSource)
  → user squad: show last good picks + banner “offline / stale”
  → never silently merge stale prices into transfer optimiser without warning
```

### 1.4 CORS and backend decision

**Conclusion: no product backend required for v1.**

- Node scripts and tests call `https://fantasy.premierleague.com` directly (existing pattern).
- Browser uses Vite `/fpl-api` proxy (dev + preview) — extend proxy paths only; not a server-side API layer.
- Service worker (`vite.config.ts`) marks `/fpl-api/*` as `NetworkOnly` — correct for live data.

If a hosted deployment cannot rely on a dev proxy (production static host without edge proxy), options are: (a) Cloudflare/nginx reverse proxy rule mirroring `/fpl-api`, or (b) minimal read-only edge function. **Discovery default:** mirror the existing GW0 proxy pattern; document deployment requirement in ticket 1.1.

### 1.5 Failure handling

| Failure | Behaviour |
| --- | --- |
| HTTP 4xx/5xx on bootstrap | Use Dexie stale snapshot; block optimiser if no snapshot |
| CORS / network | `FplLiveFetchError.corsLikely` hint (existing); same for manager fetch wrapper |
| Invalid entry ID | Clear error; do not write fake squad |
| Picks for future GW before release | Disable transfer assistant; show countdown from `events[].deadline_time` |
| Partial live GW | Show provisional points from `/event/{gw}/live/`; label “provisional” until `event-status` stable |

---

## 2. User / team model

### 2.1 Two squad states (never conflate)

| State | Source | Mutable by optimiser? | Purpose |
| --- | --- | --- | --- |
| **Actual** | `entry/{id}/event/{gw}/picks/` after refresh | **Never** | Ground truth for bank, FT count, captain, chips played |
| **Scenario** | Copy of actual + user edits | **Yes** | What-if transfers, locks, excludes |

Implementation rule: transfer MILP reads **scenario** inputs (current 15, bank, sell prices, FT budget) and writes **scenario** outputs (proposed 15). Persisting a scenario must not call FPL or overwrite actual picks.

### 2.2 Core types (proposed)

```ts
type ManagerIdentity = {
  entryId: number
  teamName: string
  playerFirstName: string
  playerLastName: string
}

type SquadPick = {
  elementId: number
  code: number          // join key from live bootstrap
  position: number      // 1–15 slot in picks API
  isCaptain: boolean
  isViceCaptain: boolean
  multiplier: number
}

type ManagerGameweekState = {
  entryId: number
  event: number
  picks: SquadPick[]              // 15
  bankTenths: number              // entry_history.bank
  squadValueTenths: number        // entry_history.value
  eventTransfers: number          // entry_history.event_transfers
  eventTransfersCost: number      // hits * 4
  activeChip: string | null       // picks.active_chip
  freeTransfers: number           // derived — see §7
  sellPriceTenthsByCode: Map<number, number>  // derived — see §6
  fetchedAt: number
}

type TransferScenario = {
  id: string                      // 'actual' | uuid
  label: string
  baseEvent: number
  state: ManagerGameweekState     // working copy
  lockedCodes: number[]
  excludedCodes: number[]
  pinnedInCodes: number[]         // optional force-buy
}
```

### 2.3 Dexie persistence (schema v6 proposal)

| Store | Key | Contents |
| --- | --- | --- |
| `userProfile` | `entryId` | Identity, last refresh |
| `userPicks` | `[entryId+event]` | Raw picks JSON + normalised `SquadPick[]` |
| `userHistory` | `entryId` | `history.current`, `history.chips` |
| `userTransfers` | `entryId` | Transfer log (for sell-price trail) |
| `transferScenarios` | `id` | Hypothetical squads (max N local scenarios) |

Actual squad refresh flow writes `userPicks` / `userHistory`. Scenario store is separate; default scenario clones actual on each “Analyse transfers” open.

### 2.4 Sell price reconstruction

Picks API gives **element id**, not purchase price. Official rules from `game_settings.transfers_sell_on_fee = 0.5` (half of rise since purchase).

**v1 approach:**

1. Players held since GW1 with no intervening transfer: opening cost from bootstrap at GW1 (`now_cost - cost_change_start` proxy) or first pick event.
2. Players bought later: reconstruct from `/entry/{id}/transfers/` (`element_in`, `element_in_cost`, `element_out`, …).
3. Sell price tenths = purchase price + `floor((now_cost - purchase_price) * 0.5)` (sign-aware for price falls — follow FPL rounding rules in implementation tests).

If reconstruction incomplete, flag player as “sell price uncertain” and use conservative (low) sell value for budget feasibility.

---

## 3. EV model (in-season)

Extend GW0 metrics (`src/analysis/metrics.ts`, `src/analysis/gw0Project.ts`) — do **not** collapse to one scalar “value”. Document every input.

### 3.1 What carries over unchanged from GW0

| Metric | Function | GW0 doc |
| --- | --- | --- |
| Shrinkage | `shrinkageC`, `adjP90`, `mixTowardBaseline` | M5–M6 |
| Event rates | `eventRatesPer90`, `eventEp90`, Approach B split | M7 |
| Fixture FDR | `lookupFactor`, `blendedFixtureFactor` | M9–M11 |
| Fitness | `fitnessMultiplier`, `fitnessFromChance` | M8 |
| Role evidence | `mSemForPlayer` | §13 |
| Confidence | Separate from EP | M13 |

Phase 0 calibrated defaults (`GW0_K_TRANS`, FDR tables in `fdr.ts`) remain starting points until in-season backtest refits them.

### 3.2 What must change in-season

| GW0 assumption | In-season change |
| --- | --- |
| Rates from **prior season only** | Blend **current-season** vaastav `merged_gw` (or API `element-summary.history`) with prior; weight by minutes played this season |
| `joinGw0Pool` / `newToPl` | Re-evaluate each GW; players with ≥450 current-season minutes use in-season raw p90 as primary |
| Project GW1–6 from GW0 snapshot | Project **next GW** + **next-X aggregate** from **current** event id |
| Minutes prior = prior `starts_rate` | Add **current-season starts rate**; blend with GW0 prior using minutes played |
| Live fitness | Prefer `chance_of_playing_this_round` during current GW; `chance_of_playing_next_round` before next deadline |
| `ep_next` | Show as reference column (`gw0EpNext.ts` pattern); **not** the objective |

### 3.3 In-season rate (IS1 — primary)

For player \(p\) at event \(e\):

**Current-season sample** (from vaastav current season or API history):

\[
\text{raw\_p90\_cur} = \frac{\sum_{g<e} \text{pts}_{p,g}}{\sum_{g<e} \text{min}_{p,g}} \times 90 \quad (\sum \text{min} \ge 90)
\]

**Prior-season shrunk rate** (existing GW0 `adj_p90_gw0` from 2025/26 join on `code`).

**Blend weight** by current-season minutes \(m_{cur}\):

\[
w = \text{shrinkageC}(m_{cur}, \text{spec}) \quad \text{(default spec: linear/900)}
\]

\[
\text{adj\_p90\_live} = w \cdot \text{raw\_p90\_cur} + (1-w) \cdot \text{adj\_p90\_gw0}
\]

Same-club vs transfer discount (`adjP90Gw0` / `k_trans`) applies to the **prior** component only when current-season minutes \(< 450\).

### 3.4 Expected minutes (IS2)

\[
E[\text{min}] = \text{clamp}\big(0,\ 90,\ \text{blend}(\text{starts\_rate\_cur},\ \text{starts\_rate\_prior}) \times 90 \times m_{sem} \times m_{fitness}\big)
\]

Use `shrunkStartsRate` from `metrics.ts` when current-season sample \(< 450\) minutes.

Double/blank GWs: same as GW0 — sum per fixture from `fixtures` (max 180).

### 3.5 Expected points next GW (IS3)

Reuse Approach A (`expectedPointsApproachA`):

\[
E[\text{pts}_{p,e}] = \frac{\text{adj\_p90\_live}}{90} \times E[\text{min}] \times f_{\text{fixture}}(e,\ \text{pos})
\]

Approach B remains audit-only unless in-season validation prefers blend (GW0 Phase 0 outcome: default \(\alpha=1\) on Approach A).

### 3.6 Horizon aggregate for retention (IS4)

Define **next-X** sum (default X = 5 for “medium horizon”):

\[
E[\text{pts}_{p,e:e+X-1}] = \sum_{k=0}^{X-1} E[\text{pts}_{p,e+k}]
\]

Each term uses that GW’s fixture(s) and the **same** rate/minutes prior (no simulated injuries between GWs — same limitation as GW0 §11, surfaced in UI).

### 3.7 Confidence (IS5)

Reuse `Gw0Confidence` structure; add drivers when rate is mostly current-season (“2026/27: 720 min, 8 starts”) vs prior-only.

### 3.8 Limitations (must show in UI)

- Bonus and defensive contribution remain high-variance.
- Blank/double GWs affect aggregates — show fixture count in horizon.
- Model does not know press leaks after refresh time.
- Captain chip (`3xc`) handled in recommendation layer, not inside base EP.

---

## 4. Team strength

**GW0 decision stands:** FDR multiplicative factors are the **v1 fixture input** (`fdr.ts`, Phase 0 calibrated tables). Simple goals-per-game team ratings stay **context charts only** (GW0 plan §5.3).

**In-season nuance:** Opponent-adjusted Poisson (or xG-based strength) is a **research ticket**, not a v1 blocker. Trigger only if mid-season backtest beats FDR on next-GW player RMSE (same bar as GW0 Phase 0 FDR gate).

If implemented later:

- Fit on completed fixtures only (no look-ahead).
- Compare vs FDR and vs “no adjustment” on rolling validation windows.
- Never replace FDR in v1 without measured improvement.

---

## 5. Future fixture metric

### 5.1 Design

| View | Formula | Use |
| --- | --- | --- |
| **Next GW** | \(E[\text{pts}_{p,e}]\) | Immediate strategy, captain hints |
| **Next 3 GW sum** | \(\sum_{k=0}^{2} E[\text{pts}_{p,e+k}]\) | Balanced retention |
| **Next 5 GW sum** | \(\sum_{k=0}^{4} E[\text{pts}_{p,e+k}]\) | Long-term strategy |

Do **not** pretend per-GW precision beyond published fixtures; if GW \(e+k\) has no fixture row yet, omit term and reduce X eff.

### 5.2 Fixture cliff flag (reuse GW0)

Port `fixtureCliff` logic from `gw0Squad.ts` (`hardGw46` consecutive FDR 4–5) into player cards in Transfer Assistant — already implemented for GW0 squads.

### 5.3 Retention influence

Retention objective uses **next-X aggregate** minus an **opportunity cost** term for holding cash / FTs (§8). Immediate objective uses next-GW EP only.

---

## 6. Transfer optimisation (MILP)

### 6.1 Design principles

1. **Final squad legality only** — evaluate the 15 players after all ins/outs together.
2. **Simultaneous transfers** — 0, 1, 2, … moves in one decision; no greedy pairwise loop.
3. **Reuse HiGHS WASM** — same stack as `gw0Solver.ts` / `buildSquadLp`.
4. **Pool** — current 15 + funnel-filtered candidates (extend `gw0Funnel.ts` or slim in-season pool ~150–250 players).

### 6.2 Variables

Index players by stable **`code`** (cross-season key). Let \(U\) be the candidate universe.

| Variable | Type | Meaning |
| --- | --- | --- |
| \(x_p\) | binary | 1 if player \(p\) in **final** 15 |
| \(s_p\) | binary | 1 if \(p\) sold (\(p\) in current, \(x_p=0\)) — optional linearisation |
| \(b_p\) | binary | 1 if \(p\) bought (\(p\) not in current, \(x_p=1\)) |

For \(p \in Current\): \(s_p \ge 1 - x_p\). For \(p \notin Current\): \(b_p \ge x_p\).

Transfer count: \(\sum s_p = \sum b_p = T\) (paired moves).

### 6.3 Constraints (final squad)

Same as GW0 `buildSquadLp` (`gw0Squad.ts`):

```text
Σ x_p = 15
Σ x_p × buy_price_p ≤ budget_available     # see §6.4
Σ_{p in club c} x_p ≤ 3
GK/DEF/MID/FWD quotas = 2/5/5/3
x_p = 0 if m_fitness = 0
Optional: lock x_p = 1, exclude x_p = 0
```

**Formation / XI:** v1 optimises **15-man squad** first (GW0 pattern). Best XI + captain for **scenario** via existing `bestLineupAcrossFormations` / `suggestCaptain` on projected EP — second stage, not part of MILP (matches GW0 captain deferral).

### 6.4 Budget (intermediate-budget case)

Let \(P_p\) = sell proceeds if \(p\) currently owned, \(C_p\) = buy price (`now_cost` tenths from live bootstrap).

\[
\text{budget\_available} = \text{bank} + \sum_{p \in Current} P_p \cdot s_p
\]

\[
\sum_{p \in U} C_p \cdot x_p \le \text{budget\_available}
\]

This single inequality correctly handles **sell-before-buy** ordering without sequencing variables — classic FPL transfer MILP pattern. Sell prices \(P_p\) from §2.4.

### 6.5 Transfer count and hits

Let \(FT\) = free transfers available, \(H = \max(0, T - FT)\) hit count.

**Linearisation for hits:** cap \(T \le FT + H_{max}\) with integer \(T = \sum s_p\). Penalty term \(-4 \cdot \max(0, T-FT)\) is piecewise-linear:

Introduce integer \(h \ge T - FT\), \(h \ge 0\):

\[
\text{Maximize } \sum_p x_p \cdot EP_p - 4h \quad \text{s.t. } h \ge T - FT
\]

For \(FT \in \{0,1,2\}\) and practical cap \(T \le 15\), can also **enumerate** \(T \in \{0..FT+3\}\) and solve a MILP per \(T\) (small constant factor) — simpler to test.

**Wildcard / free hit:** separate modes — when chip active, set \(h=0\) and \(T\) unbounded (or up to 15) with mode-specific constraints; chip state read-only from actual squad.

### 6.6 Objectives (link to §9)

| Strategy | Objective (on final 15) |
| --- | --- |
| Immediate | \(\max \sum x_p E[\text{pts}_{p,e}] - 4h\) |
| Balanced | \(\max \sum x_p E[\text{pts}_{p,e:e+2}] - 4h - \lambda \cdot \text{retentionCost}\) |
| Long-term | \(\max \sum x_p E[\text{pts}_{p,e:e+4}] - 4h\) |

Do not use EPPM or `ep_next` as objective.

### 6.7 Output

For each strategy, return optimal \(x\), implied ins/outs, \(T\), \(h\), spend, remaining bank, and `OrderedSquad`-like structure for UI pitch view.

### 6.8 Relation to `perfectSeason.ts`

`perfectSeason.ts` uses hindsight beam search with known outcomes — useful reference for **FT banking** and hit accounting, not for production optimiser. Do not ship hindsight search as live recommender.

---

## 7. Transfer penalties

### 7.1 Official rules (from API)

From `bootstrap-static.game_settings` (probed 2026-08-23):

| Rule | Value |
| --- | --- |
| `squad_squadsize` | 15 |
| `squad_squadplay` | 11 |
| `squad_team_limit` | 3 |
| `squad_total_spend` | 1000 tenths (£100m) |
| `transfers_sell_on_fee` | 0.5 |
| `transfers_cap` | 20 (max price rise capture — document in sell formula tests) |
| `max_extra_free_transfers` | 4 (bank cap) |

### 7.2 Free transfer state

Derive from `history.current`:

- Start GW1 with 1 FT (standard rule).
- Each GW without transfer: `freeTransfers = min(FT + 1, 2)` (cap at 2 banked pre-wildcard rules).
- `event_transfers` and `event_transfers_cost` on the **upcoming** GW row (or last completed + logic) feed validation.

Exact FT counter must be unit-tested against FPL help docs + sample manager histories once GW2 transfers exist in API samples (GW1 probe had zero transfers league-wide).

### 7.3 Hit penalty interaction

- Each transfer beyond \(FT\) costs **4 points** on the GW score (not on EP projection — subtract in objective).
- Multi-transfer: one hit charge per **extra** transfer (e.g. FT=1, T=3 → H=2 → −8).
- **Immediate vs retention horizon:** immediate objective treats hits as full −4 in current GW; balanced/long-term may add soft penalty if banking FT is optimal (optional tie-break — do not double-count).

### 7.4 Chips

Read `active_chip` from picks / `history.chips`. Modes:

| Chip | Optimiser behaviour |
| --- | --- |
| Wildcard | Unlimited free transfers; ignore FT/hits |
| Free Hit | Temporary squad; recommendations reset post-GW |
| Bench Boost / Triple Captain | No change to transfer MILP; surface in recommendation risks |

---

## 8. Retention model

**Keep vs sell opportunity cost:** For each current player \(p\), compute \(\Delta_p = EP^{\text{replace}}_p - EP_p\) where \(EP^{\text{replace}}_p\) is the best feasible alternative filling \(p\)'s slot **holding rest of squad fixed** — expensive to compute exactly; approximate via:

- **Shadow price:** dual value from MILP position/club constraints (future enhancement), or
- **Heuristic v1:** if \(p\)'s next-X EP ranks below 12th in position pool and price frees upgrade above threshold, flag “sell candidate”.

**Transfer scarcity:** Value of banking FT:

\[
V_{\text{FT}} \approx \mathbb{E}[\text{best single move next GW}] - \text{cost of delaying one week}
\]

v1: show “1 FT saved” as informational when recommending 0-transfer; defer quantitative FT valuation until GW2+ validation data.

**Retention term in balanced objective:** subtract small \(\lambda \sum (1-x_p)\) for current players with above-median next-5 EP (discourage churn) — \(\lambda\) tuned so it never dominates EP (diagnostic slider in UI later).

---

## 9. Strategy types

Formulations only (not separate UI skins):

| ID | Label | Optimiser objective | Typical horizon |
| --- | --- | --- | --- |
| `immediate` | Play this GW | \(\max \sum x_p E[\text{pts}_{p,e}] - 4h\) | \(e\) only |
| `balanced` | Balance | \(\max \sum x_p \sum_{k=0}^{2} E[\text{pts}_{p,e+k}] - 4h\) | 3 GW |
| `longTerm` | Fixture swing | \(\max \sum x_p \sum_{k=0}^{4} E[\text{pts}_{p,e+k}] - 4h\) | 5 GW |

Same feasible region (FPL rules + budget + pins). Multiple optima → show top 3 bounded alternative squads by excluding previous solution (no-good cut) — optional v1.1.

---

## 10. Reachable vs theoretical optimum

| Term | Meaning | Communication |
| --- | --- | --- |
| **Theoretical** | Best 15 ignoring budget/FT/hits from full pool | Upper bound diagnostic only |
| **Reachable** | MILP optimum from **current** squad + bank + FT | Primary recommendation |
| **Gap** | \(\text{theoretical EP} - \text{reachable EP}\) | “You’re ~X pts short of unconstrained best — budget/FT/hits limit moves” |

Do not show theoretical as a recommended squad. Perfect-team pages (`PerfectTeamPage.tsx`) remain **hindsight education**, not live assistant output.

---

## 11. Recommendation object

```ts
type TransferMove = {
  out: { code: number; webName: string; sellPriceTenths: number }
  in: { code: number; webName: string; buyPriceTenths: number }
}

type TransferRecommendation = {
  id: string
  strategy: 'immediate' | 'balanced' | 'longTerm'
  moves: TransferMove[]
  transferCount: number
  hitCount: number
  hitPoints: number
  freeTransfersUsed: number
  freeTransfersRemaining: number
  bankBeforeTenths: number
  bankAfterTenths: number
  epDeltaNextGw: number
  epDeltaHorizon: number
  captainSuggestion: { code: number; webName: string; epGw: number }
  risks: string[]           // e.g. "Doubful 75% chance", "3 per MCI"
  alternativesRejected: Array<{
    reason: string          // "Same EP within 0.3 but +1 hit"
    summary: string
  }>
  auditRefs: string[]       // keys into per-player audit blobs
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  generatedAt: number
  scenarioId: string
}
```

Explainability: each move links to player audit strings (`auditLine` from `gw0Project.ts`).

---

## 12. UI architecture

Weekly workflow hierarchy:

```text
Home
 └── My Team (actual squad from API — pitch, bank, FT, chips)
      └── Current GW (live points, fixture status, provisional bonus)
           └── Transfer Assistant (scenario optimiser — locks/excludes, strategies)
                └── Team Outlook (next 5 GW EP heatmap / fixture cliff)
```

| Route (proposed) | Purpose |
| --- | --- |
| `/team` | Manager connect (entry ID), actual squad pitch |
| `/team/gw/:n` | GW detail + live stats overlay |
| `/team/transfers` | Scenario builder + recommendations |
| `/team/outlook` | Horizon EP table |

Reuse components: `FplPitch.tsx`, `FplPitch.css`, `GameweekPointsChart.tsx`, `Gw0MetricsExplainer.tsx` (generalise copy).

**GW0 `/gw0` remains** pre-season / sandbox squad builder — do not merge routes; link “Compare to GW0 model” as optional export.

Entry ID capture: numeric input + validate via `/api/entry/{id}/`. Store in Dexie `userProfile`; never send to third parties.

---

## 13. Testing & validation

| Area | Tests |
| --- | --- |
| API parsing | Golden JSON fixtures from Appendix A for bootstrap, picks, history, live |
| Manager state | FT counter, bank, squad value from `entry_history` |
| Sell price | Known purchase paths → expected sell tenths |
| FPL rules | 15 size, positions, club limit, budget, fitness exclusion |
| EV in-season | Blend weight at 0 / 450 / 900 current minutes; FDR monotonicity |
| MILP | 0-transfer feasible; 2-for-2 with hit; budget tight edge; lock/exclude infeasible messages reuse `SquadInfeasibleError` patterns |
| Multi-transfer | 3 simultaneous outs + ins vs greedy single-swap baseline — assert greedy can miss optimum (constructed fixture) |
| Chips | Wildcard disables hit terms |
| Recommendations | Snapshot test of `TransferRecommendation` shape |
| UI | Scenario never writes to actual picks store (integration) |

Regression: extend existing vitest suites in `src/analysis/*.test.ts`, `fplLiveSource.test.ts`.

---

## 14. Data architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser UI (React)                                          │
└───────────────┬───────────────────────────────┬─────────────┘
                │                               │
        ┌───────▼────────┐              ┌───────▼────────┐
        │ Analysis layer │              │ Data providers │
        │ gw0Project →   │              │ FplDataProvider│
        │ liveProject    │              │ + user refresh │
        │ transferSolver │              └───────┬────────┘
        └───────┬────────┘                      │
                │                      ┌────────▼────────┐
                │                      │ fplLiveSource   │
                │                      │ + userEntry*    │
                └──────────────────────┤ vaastav ingest  │
                                       └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │ Dexie (IndexedDB)│
                                       │ seasons*, live*, │
                                       │ user*, scenarios*│
                                       └─────────────────┘
                ┌───────────────────────────┴───────────────────────────┐
                │ On-demand / memory only                               │
                │ element-summary cache, live GW polling, MILP working    │
                └───────────────────────────────────────────────────────┘
```

| Data | Storage | TTL |
| --- | --- | --- |
| Vaastav seasons | Dexie `players`, `performances`, … | Historical ∞; current 6h |
| Live bootstrap | `live*` stores | 6h |
| Manager actual | `user*` stores | 30m (configurable) |
| Scenarios | `transferScenarios` | Until user deletes |
| MILP pool / EP matrix | Memory per solve | Ephemeral |
| element-summary | Memory LRU or Dexie optional | 6h per player |

---

## 15. Implementation ticket plan

**Do not create via MCP** — for Orchestrator / human approval only. Sequential deps match graph above.

### LT-1 — FPL manager API client

| Field | Detail |
| --- | --- |
| **Objective** | Fetch and parse entry, picks, history, transfers |
| **Scope** | Extend `fplLiveSource.ts` or sibling `fplUserSource.ts`; shared `officialApiUrl` |
| **Deps** | None |
| **Approach** | Mirror bootstrap error handling; types in `types.ts` |
| **Acceptance** | Unit tests with Appendix A fixtures; CORS via `/fpl-api` |
| **UI** | Entry ID settings panel stub |
| **Concurrency** | Parallel fetch entry+picks+history |

### LT-2 — Dexie user stores + refresh policy

| Field | Detail |
| --- | --- |
| **Objective** | Persist manager state; stale-while-revalidate |
| **Scope** | Schema v6 stores §2.3 |
| **Deps** | LT-1 |
| **Acceptance** | Refresh idempotent; actual vs scenario separation enforced |
| **Tests** | Store isolation test |

### LT-3 — Sell price + FT state engine

| Field | Detail |
| --- | --- |
| **Objective** | Derive sell prices and free transfers |
| **Scope** | §2.4, §7 |
| **Deps** | LT-2 |
| **Acceptance** | Golden cases; unknown sell price flagged |
| **Tests** | Table-driven FT banking |

### LT-4 — In-season projection engine

| Field | Detail |
| --- | --- |
| **Objective** | `liveProject.ts` extending `gw0Project.ts` |
| **Scope** | Metrics IS1–IS5; join current-season performances |
| **Deps** | LT-2, existing vaastav current season |
| **Acceptance** | Audit strings reconstruct EP; matches GW0 when current minutes = 0 |
| **Tests** | `metrics.test.ts` extensions |

### LT-5 — Transfer MILP solver

| Field | Detail |
| --- | --- |
| **Objective** | Multi-transfer optimiser §6 |
| **Scope** | `transferSolver.ts` + HiGHS; reuse `gw0Solver` loader |
| **Deps** | LT-3, LT-4 |
| **Acceptance** | Beats greedy on constructed counterexample; handles 2-for-1 + hit |
| **Tests** | ILP feasibility + objective snapshots |

### LT-6 — Recommendation builder

| Field | Detail |
| --- | --- |
| **Objective** | Map solver output → §11 objects + risks |
| **Deps** | LT-5 |
| **Acceptance** | Three strategies; captain suggestion; alternatives list |
| **UI** | None yet |

### LT-7 — My Team + Current GW UI

| Field | Detail |
| --- | --- |
| **Objective** | Actual squad pitch, live GW overlay |
| **Deps** | LT-2, LT-4 |
| **Acceptance** | Shows provisional live points; stale banner |
| **Routes** | `/team`, `/team/gw/:n` |

### LT-8 — Transfer Assistant UI

| Field | Detail |
| --- | --- |
| **Objective** | Scenario locks, run optimiser, show recommendations |
| **Deps** | LT-6, LT-7 |
| **Acceptance** | Never mutates actual; explain audits per move |

### LT-9 — Team Outlook UI

| Field | Detail |
| --- | --- |
| **Objective** | Next-X EP + fixture cliff |
| **Deps** | LT-4, LT-7 |
| **Acceptance** | Horizon sums match engine |

### LT-10 — Live GW polling

| Field | Detail |
| --- | --- |
| **Objective** | `event/{gw}/live` + `event-status` refresh loop |
| **Deps** | LT-1 |
| **Acceptance** | Stops polling when GW finalised |

### LT-11 — Validation harness (optional Phase)

| Field | Detail |
| --- | --- |
| **Objective** | In-season next-GW RMSE vs vaastav |
| **Deps** | LT-4 |
| **Acceptance** | Report doc similar to `gw0-phase-0-validation.md` |

**Suggested merge order:** LT-1 → LT-2 → LT-3 ∥ LT-4 → LT-5 → LT-6 → LT-7 → LT-8 / LT-9 → LT-10 → LT-11.

---

## Appendix A — API investigation

**Probed at:** 2026-08-23T20:11:21Z (Node fetch, `User-Agent: FPL-PWA/0.0 discovery`)

**Script:** `scripts/discovery/probe-fpl-api.mjs` (non-production). Full raw output: `scripts/discovery/probe-results.json`.

### A.1 Summary table

| Endpoint | Status | Notes |
| --- | ---: | --- |
| `GET /api/bootstrap-static/` | 200 | ~1.6 MB; 609 elements; GW1 `is_current` |
| `GET /api/fixtures/` | 200 | 380 fixtures |
| `GET /api/event-status/` | 200 | Bonus/points flags per date |
| `GET /api/event/1/live/` | 200 | 609 live element rows |
| `GET /api/element-summary/1/` | 200 | fixtures + history + history_past |
| `GET /api/dream-team/1/` | 200 | Dream team for GW1 |
| `GET /api/entry/1/` | 200 | Manager profile |
| `GET /api/entry/1/history/` | 200 | current / past / chips |
| `GET /api/entry/1/transfers/` | 200 | `[]` during GW1 (no moves yet) |
| `GET /api/entry/1/event/1/picks/` | 200 | 15 picks + entry_history |
| `GET /api/entry/by-player-code/154561/` | 404 | No player-code API |
| `GET /api/entry/by-code/154561/` | 404 | |
| `GET /api/player/154561/` | 404 | |
| `GET /api/entry/154561/` | 200 | **Entry ID**, not player code (different manager) |

### A.2 `bootstrap-static` top-level keys

`chips`, `events`, `game_settings`, `game_config`, `phases`, `teams`, `total_players`, `element_stats`, `element_types`, `elements`

**Sample event (GW1):**

```json
{
  "id": 1,
  "name": "Gameweek 1",
  "is_current": true,
  "is_next": false,
  "finished": false,
  "deadline_time": "2026-08-21T17:30:00Z",
  "average_entry_score": 36,
  "ranked_count": 8904519
}
```

**Sample element:**

```json
{
  "id": 1,
  "code": 154561,
  "web_name": "Raya",
  "team": 1,
  "element_type": 1,
  "now_cost": 60,
  "status": "a",
  "ep_next": "4.0",
  "selected_by_percent": "37.8"
}
```

**`game_settings` (transfer-relevant):**

```json
{
  "squad_squadsize": 15,
  "squad_squadplay": 11,
  "squad_team_limit": 3,
  "squad_total_spend": 1000,
  "transfers_sell_on_fee": 0.5,
  "transfers_cap": 20,
  "max_extra_free_transfers": 4,
  "stats_form_days": 30
}
```

### A.3 `entry/{id}/` (entry 1)

Keys include: `id`, `name`, `player_first_name`, `player_last_name`, `started_event`, `current_event`, `summary_overall_points`, `summary_overall_rank`, `last_deadline_bank`, `last_deadline_value`, `last_deadline_total_transfers`, `leagues`, `kit`.

Sample:

```json
{
  "id": 1,
  "name": "Solio Moose",
  "current_event": 1,
  "last_deadline_bank": 0,
  "last_deadline_value": 1000
}
```

### A.4 `entry/{id}/event/{gw}/picks/`

Top-level: `active_chip`, `automatic_subs`, `entry_history`, `picks`.

Sample pick:

```json
{
  "element": 1,
  "position": 1,
  "multiplier": 1,
  "is_captain": false,
  "is_vice_captain": false,
  "element_type": 1
}
```

Sample `entry_history` embedded in picks:

```json
{
  "event": 1,
  "points": 30,
  "total_points": 30,
  "bank": 0,
  "value": 1000,
  "event_transfers": 0,
  "event_transfers_cost": 0,
  "points_on_bench": 4
}
```

### A.5 `entry/{id}/history/`

`current[]` rows mirror per-GW stats (rank, bank, value, transfers). `chips[]` lists chip plays. Sample GW1 row includes `overall_rank`, `event_transfers`, `event_transfers_cost`.

### A.6 `event/{gw}/live/`

```json
{
  "elements": [
    {
      "id": 115,
      "stats": {
        "minutes": 77,
        "goals_scored": 1,
        "assists": 1,
        "clean_sheets": 1,
        "bonus": 2,
        "total_points": 17,
        "expected_goals": "1.40",
        "defensive_contribution": 5
      },
      "explain": [{ "fixture": 7, "stats": [{ "identifier": "minutes", "points": 2, "value": 77 }] }],
      "modified": false
    }
  ]
}
```

### A.7 `event-status/`

```json
{
  "status": [
    { "bonus_added": false, "date": "2026-08-23", "event": 1, "points": "p" }
  ],
  "leagues": "Updating"
}
```

`points: "p"` = provisional; empty string when not scoring that day.

### A.8 `element-summary/{id}/`

Sections: `fixtures[]`, `history[]` (GW rows with 41+ stat fields), `history_past[]` (season aggregates).

### A.9 Player code vs entry ID

| Approach | Works? |
| --- | --- |
| Manager **entry ID** in `/api/entry/{id}/` | Yes — primary |
| **Player code** in URL | No official API; numeric collision with entry IDs |
| Vanity team URL scraping | Out of scope; brittle |

### A.10 CORS note

Direct browser fetch to `fantasy.premierleague.com` fails CORS (existing `FplLiveFetchError` path). All browser calls must use `/fpl-api` proxy prefix from `officialApiUrl()`.

---

## Out of scope (this programme)

- Production application code (this discovery only)
- Backend API server (unless deployment proxy cannot mirror `/fpl-api`)
- Greedy single-swap transfer search as primary engine
- Collapsing EP + price + form into one “value” score
- Replacing Vaastav or GW0 MILP
- Auto-opening PR / MCP ticket creation

---

## References

- `docs/gw0-modelling-plan.md` — metric catalogue M1–M13, LP §14, limitations
- `src/analysis/metrics.ts` — reusable formulas
- `src/analysis/gw0Project.ts` — projection + audit
- `src/analysis/gw0Squad.ts` / `gw0Solver.ts` — MILP constraints + HiGHS
- `src/data/fplLiveSource.ts` — live ingest pattern
- `src/analysis/perfectSeason.ts` — hindsight transfer accounting reference only
