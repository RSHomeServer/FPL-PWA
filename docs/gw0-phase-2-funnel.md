# GW0 Phase 2 — quantitative funnel and RoleEvidence

Generated: 2026-08-18T13:27:46.094Z

Prototype output of `docs/gw0-modelling-plan.md` §13 / §18 Phase 2. Produced by `npm run gw0:phase2`.

This is **not** a recommended 15-player squad. There is no optimiser in this ticket.

## Sources

- Official FPL bootstrap + fixtures (590 elements, 380 fixtures).
- Prior rates: vaastav **2025-26** (join key **`code`**).
- Next event: GW1 (2026-08-21T17:30:00Z).
- Live season id: `2026-27`.
- RoleEvidence seed: `src/analysis/gw0RoleEvidence.seed.json` (89 records). Unreviewed LP players keep `m_sem = 1`.

## Shipped thresholds

The modelling-plan funnel shape is unchanged (selectable → drop unavailable → quantitative OR → auto-flag). Counts on live 2026/27 with the *proposed* 60% EPPM / 20% minutes knobs were LP ≈ 416 and flags ≈ 188, so the numeric cutoffs were tightened:

| Knob | Shipped value | Notes |
| --- | --- | --- |
| Position EP floors | GK 3.5, DEF 3.4, MID 3.6, FWD 3.6 | GW1 Approach A expected points |
| EPPM keep-top fraction | 25% **within position** among available players | Retuned from 60% of the whole available pool |
| EPPM cutoffs (this run) | GK 0.63, DEF 0.61, MID 0.52, FWD 0.5 | Inclusive; players at or above the cutoff pass |
| Prior minutes share | 50% of 38×90 = **1710 minutes** | Retuned from 20% (684) |
| Auto-flag low minutes | < 450 PL minutes | Unchanged from the plan |

## Funnel counts

```text
All with code (590)
  → selectable (564)
  → exclude unavailable / cannot select (−50)
  → available (514)
  → quantitative LP pool (238)
  → auto-flag for review (89)
```

| Check | n |
| --- | ---: |
| Official elements with `code` | 590 |
| Selectable | 564 |
| Available (`canSelect` and `m_fitness>0`) | 514 |
| LP pool | 238 |
| Auto-flag review set | 89 |
| Seeded RoleEvidence | 89 |
| Unreviewed in the flag set | 0 |
| GW1 fixtures | 10 |

### LP inclusion reasons (OR; a player may count in more than one)

| Reason | n |
| --- | ---: |
| `epFloor` | 42 |
| `eppm` | 133 |
| `minutesShare` | 160 |

### Auto-flag reasons (OR; machine-readable on each row)

| Reason | n |
| --- | ---: |
| `newClub` | 22 |
| `lowMinutes` | 65 |
| `doubtful` | 8 |
| `newToPl` | 60 |
| `promotedClub` | 26 |

## Before / after GW1 EP (reviewed flag set)

`m_sem` for unreviewed flagged players stays 1.00. Seeded rows apply `startingLikelihood × roleChange`. Fitness still comes from the official API; `fitnessConcern` is audit unless both chance fields are empty.

| Player | Pos | Club | Flags | start / change | m_sem | E min before | E min after | EP GW1 before | EP GW1 after |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Mukiele | DEF | SUN | doubtful | MEDIUM / NONE | 0.85 | 76.5 | 65.02 | 4.15 | 3.53 |
| Bruno G. | MID | ARS | newClub | MEDIUM / MINOR | 0.77 | 83.79 | 64.1 | 3.94 | 3.01 |
| Alderete | DEF | SUN | doubtful | MEDIUM / NONE | 0.85 | 74.18 | 63.05 | 3.32 | 2.82 |
| Matheus N. | DEF | MCI | doubtful | MEDIUM / NONE | 0.85 | 76.5 | 65.02 | 3.17 | 2.7 |
| Wilson | MID | LEE | newClub | MEDIUM / MINOR | 0.77 | 80 | 61.2 | 3.06 | 2.34 |
| Anderson | MID | MCI | newClub | MEDIUM / MINOR | 0.77 | 87.63 | 67.04 | 2.88 | 2.21 |
| Ellborg | GK | SUN | lowMinutes | LOW / NONE | 0.55 | 89.95 | 49.47 | 3.93 | 2.16 |
| Rogers | MID | CHE | newClub | MEDIUM / MINOR | 0.77 | 90 | 68.85 | 2.82 | 2.16 |
| Senesi | DEF | TOT | newClub | MEDIUM / MINOR | 0.77 | 90 | 68.85 | 2.77 | 2.12 |
| Lacroix | DEF | CHE | newClub | MEDIUM / MINOR | 0.77 | 90 | 68.85 | 2.6 | 1.99 |
| Van Hecke | DEF | TOT | newClub | MEDIUM / MINOR | 0.77 | 90 | 68.85 | 2.4 | 1.83 |
| Fernandes | MID | TOT | newClub | MEDIUM / MINOR | 0.77 | 87.5 | 66.94 | 2.38 | 1.82 |
| Arrizabalaga | GK | ARS | lowMinutes | LOW / NONE | 0.55 | 89.89 | 49.44 | 3.2 | 1.76 |
| Anthony | MID | BRE | newClub | MEDIUM / MINOR | 0.77 | 80 | 61.2 | 2.28 | 1.74 |
| Welbeck | FWD | CHE | newClub | MEDIUM / MINOR | 0.77 | 65 | 49.73 | 2.22 | 1.7 |
| Tielemans | MID | MUN | newClub | MEDIUM / MINOR | 0.77 | 75.6 | 57.83 | 2.08 | 1.59 |
| Darlow | GK | MUN | newClub,doubtful | MEDIUM / MINOR | 0.77 | 76.5 | 58.52 | 2.06 | 1.57 |
| Pinnock | DEF | BRE | lowMinutes | LOW / NONE | 0.55 | 86.08 | 47.34 | 2.83 | 1.56 |
| Abbott | DEF | NFO | lowMinutes | LOW / NONE | 0.55 | 70.54 | 38.8 | 2.65 | 1.46 |
| Davies | DEF | TOT | lowMinutes | LOW / NONE | 0.55 | 71.61 | 39.39 | 2.58 | 1.42 |
| Emersonn | FWD | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Hirst | FWD | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Akpom | FWD | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Walle Egeli | FWD | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Al-Hamadi | FWD | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Obi | FWD | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.53 | 26.21 | 3.37 | 1.39 |
| Meslier | GK | ARS | newClub,lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Walton | GK | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Palmer | GK | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Button | GK | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Van Oevelen | GK | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Scherpen | GK | IPS | newClub,lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Benda | GK | NFO | newClub,lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 3.33 | 1.37 |
| Jocelin.T | MID | SUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 69.33 | 28.6 | 3.3 | 1.36 |
| Kipré | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| O'Shea | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Davis | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Greaves | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Johnson | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Furlong | DEF | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Amass | DEF | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| O.Richards | DEF | NFO | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Bindon | DEF | NFO | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 3.22 | 1.33 |
| Fábio Vieira | MID | ARS | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Núñez | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Clarke | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Ogbene | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Fatawu | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Philogene | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| McAteer | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Mehmeti | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Maeda | MID | IPS | lowMinutes,newToPl,promotedClub | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Collyer | MID | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Schlager | MID | NFO | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 3.21 | 1.32 |
| Fredricson | DEF | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.3 | 31.47 | 3.2 | 1.32 |
| Bendito Mantato | MID | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 65.18 | 26.88 | 3.1 | 1.28 |
| Fletcher | MID | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 64.88 | 26.76 | 3.09 | 1.27 |
| Struijk | DEF | BHA | newClub,doubtful | MEDIUM / MINOR | 0.77 | 76.5 | 58.52 | 1.63 | 1.24 |
| Lacey | MID | MUN | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 61.43 | 25.34 | 2.93 | 1.21 |
| Tonali | MID | TOT | newClub | MEDIUM / MINOR | 0.77 | 79.71 | 60.98 | 1.55 | 1.19 |
| Dubravka | GK | TOT | newClub | MEDIUM / MINOR | 0.77 | 90 | 68.85 | 1.55 | 1.19 |
| C.Jones | MID | LIV | doubtful | MEDIUM / NONE | 0.85 | 40.5 | 34.42 | 1.39 | 1.18 |
| Adams | MID | BOU | doubtful | MEDIUM / NONE | 0.85 | 66.94 | 56.9 | 1.35 | 1.15 |
| Furo | FWD | BRE | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.39 | 26.15 | 2.73 | 1.13 |
| Mheuka | FWD | CHE | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.39 | 26.15 | 2.73 | 1.13 |
| Florentino | MID | IPS | newClub,promotedClub | LOW / MINOR | 0.5 | 75 | 37.13 | 2.25 | 1.11 |
| Scarlett | FWD | TOT | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 62.54 | 25.8 | 2.7 | 1.11 |
| McConnell | MID | LIV | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 67.42 | 27.81 | 2.61 | 1.08 |
| Oriola | MID | BHA | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 67.27 | 27.75 | 2.6 | 1.07 |
| Drakes-Thomas | MID | CRY | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 66.37 | 27.38 | 2.57 | 1.06 |
| Olusesi | MID | TOT | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 65.32 | 26.95 | 2.53 | 1.04 |
| Burrowes | MID | AVL | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 65.03 | 26.82 | 2.51 | 1.04 |
| Steele | GK | BHA | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 2.51 | 1.04 |
| Matthews | GK | CRY | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 2.51 | 1.04 |
| Pecsi | GK | LIV | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 2.51 | 1.04 |
| Davies | GK | LIV | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 2.51 | 1.04 |
| Austin | GK | TOT | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 89.87 | 37.07 | 2.51 | 1.04 |
| Nedeljkovic | DEF | AVL | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 2.48 | 1.02 |
| Aznou | DEF | EVE | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 2.48 | 1.02 |
| Lucky | DEF | LIV | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 2.48 | 1.02 |
| Ramsay | DEF | LIV | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.64 | 31.61 | 2.48 | 1.02 |
| Byfield | DEF | TOT | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.47 | 31.54 | 2.47 | 1.02 |
| Rowswell | DEF | TOT | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 76.47 | 31.54 | 2.47 | 1.02 |
| George Hemmings | MID | AVL | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.68 | 26.27 | 2.46 | 1.02 |
| Mukasa | MID | MCI | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.68 | 26.27 | 2.46 | 1.02 |
| D.Essugo | MID | CHE | lowMinutes,newToPl | LOW / MAJOR | 0.41 | 63.53 | 26.2 | 2.46 | 1.01 |
| Lukić | MID | IPS | newClub,promotedClub | LOW / MINOR | 0.5 | 69.23 | 34.27 | 2.01 | 1 |
| Henderson | MID | CHE | newClub,doubtful | MEDIUM / MINOR | 0.77 | 52.59 | 40.23 | 1.27 | 0.97 |
| Johnson | MID | EVE | newClub | MEDIUM / MINOR | 0.77 | 51.82 | 39.64 | 1.2 | 0.92 |

All auto-flagged players have a seed row.

## Sample audit lines (after m_sem)

| Player | Audit (GW1) |
| --- | --- |
| Mukiele | prior 2784m raw_p90=4.88 c=1.00 baseline=3.78 k_trans=1 E_min=65.0 FDR=2 f=1.00 m_sem=0.85 start=MEDIUM change=NONE m_fit=0.85 rate=3.53 E_pts=3.53 |
| Bruno G. | prior 2456m raw_p90=5.64 c=1.00 baseline=4.29 k_trans=0.75 E_min=64.1 FDR=2 f=1.00 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=3.01 E_pts=3.01 |
| Alderete | prior 2797m raw_p90=4.02 c=1.00 baseline=3.78 k_trans=1 E_min=63.1 FDR=2 f=1.00 m_sem=0.85 start=MEDIUM change=NONE m_fit=0.85 rate=2.82 E_pts=2.82 |
| Matheus N. | prior 2861m raw_p90=4.84 c=1.00 baseline=3.78 k_trans=1 E_min=65.0 FDR=3 f=0.77 m_sem=0.85 start=MEDIUM change=NONE m_fit=0.85 rate=2.70 E_pts=2.70 |
| Wilson | prior 2674m raw_p90=5.65 c=1.00 baseline=4.29 k_trans=0.75 E_min=61.2 FDR=3 f=0.81 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=2.34 E_pts=2.34 |
| Anderson | prior 3332m raw_p90=4.86 c=1.00 baseline=4.29 k_trans=0.75 E_min=67.0 FDR=3 f=0.81 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=2.21 E_pts=2.21 |
| Ellborg | prior 270m raw_p90=5.33 c=0.30 baseline=3.34 k_trans=1 E_min=49.5 FDR=2 f=1.00 m_sem=0.55 start=LOW change=NONE m_fit=1.00 rate=2.16 E_pts=2.16 |
| Rogers | prior 3280m raw_p90=4.64 c=1.00 baseline=4.29 k_trans=0.75 E_min=68.8 FDR=3 f=0.81 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=2.16 E_pts=2.16 |
| Senesi | prior 3288m raw_p90=4.79 c=1.00 baseline=3.78 k_trans=0.75 E_min=68.8 FDR=3 f=0.77 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=2.12 E_pts=2.12 |
| Lacroix | prior 3085m raw_p90=4.49 c=1.00 baseline=3.78 k_trans=0.75 E_min=68.8 FDR=3 f=0.77 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=1.99 E_pts=1.99 |
| Van Hecke | prior 3210m raw_p90=4.15 c=1.00 baseline=3.78 k_trans=0.75 E_min=68.8 FDR=3 f=0.77 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=1.83 E_pts=1.83 |
| Fernandes | prior 3017m raw_p90=4.03 c=1.00 baseline=4.29 k_trans=0.75 E_min=66.9 FDR=3 f=0.81 m_sem=0.77 start=MEDIUM change=MINOR m_fit=1.00 rate=1.82 E_pts=1.82 |

## How to rerun

```bash
node "${SONGARA_PROJECTS_ROOT:-$HOME/projects}/PWA-Base/scripts/ensure-sibling-file-deps.mjs"
npm install
npm test
npm run gw0:phase2
```

Inspect or edit enums in the PWA at `/gw0-flags` (Dexie overlay on the committed seed).
