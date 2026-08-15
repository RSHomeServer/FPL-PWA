/**
 * Plug-in point for the official FPL HTTP API. Not implemented in this ticket.
 *
 * When wired later, prefer the same domain records in `types.ts`. Official payloads
 * already use element ids, team ids, fixture ids, `now_cost` in tenths, and
 * `element_type` 1–4. Map those fields through `parsePlayerRow` / `positionFromElementType`
 * instead of a second model.
 *
 * Typical endpoints (do not call from this app yet):
 * - GET /api/bootstrap-static/  → players, teams, events
 * - GET /api/fixtures/          → fixtures
 * - GET /api/event/{n}/live/    → per-gameweek element stats
 */
export type FplLiveSource = {
  kind: 'official-api'
  fetchBootstrap(): Promise<unknown>
  fetchFixtures(): Promise<unknown>
  fetchEventLive(event: number): Promise<unknown>
}
