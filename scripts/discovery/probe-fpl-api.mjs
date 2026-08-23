#!/usr/bin/env node
/** Throwaway discovery probe — not production. Run: node scripts/discovery/probe-fpl-api.mjs */
const ORIGIN = 'https://fantasy.premierleague.com'
const UA = 'FPL-PWA/0.0 (live-transfer discovery; https://github.com/RSHomeServer/FPL-PWA)'

async function get(path) {
  const url = `${ORIGIN}${path}`
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* */ }
    return { path, url, ok: res.ok, status: res.status, ms: Date.now() - t0, json, textLen: text.length, textSample: text.slice(0, 500) }
  } catch (e) {
    return { path, url, ok: false, status: null, ms: Date.now() - t0, error: String(e) }
  }
}

function shape(obj, depth = 0, maxKeys = 12) {
  if (obj == null) return obj
  if (Array.isArray(obj)) {
    const sample = obj[0]
    return { type: 'array', length: obj.length, itemShape: sample ? shape(sample, depth + 1, 8) : null }
  }
  if (typeof obj !== 'object') return typeof obj
  if (depth > 2) return 'object…'
  const keys = Object.keys(obj)
  const out = { type: 'object', keys: keys.slice(0, maxKeys) }
  if (keys.length > maxKeys) out.keysTruncated = keys.length
  const nested = {}
  for (const k of keys.slice(0, 6)) nested[k] = shape(obj[k], depth + 1, 6)
  out.fields = nested
  return out
}

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj && k in obj) out[k] = obj[k]
  return out
}

const results = []

// 1 bootstrap
const bootstrap = await get('/api/bootstrap-static/')
results.push({ ...bootstrap, shape: bootstrap.json ? shape(bootstrap.json) : null })
const root = bootstrap.json ?? {}
const events = root.events ?? []
const elements = root.elements ?? []
const current = events.find(e => e.is_current) ?? events.find(e => e.is_next) ?? events[0]
const currentGw = current?.id ?? 1
const samplePlayer = elements.find(e => e.code) ?? elements[0]
const sampleElementId = samplePlayer?.id
const sampleCode = samplePlayer?.code

// 2 fixtures
const fixtures = await get('/api/fixtures/')
results.push({ ...fixtures, shape: fixtures.json ? shape(fixtures.json) : null })

// 3 event-status
const eventStatus = await get('/api/event-status/')
results.push({ ...eventStatus, shape: eventStatus.json ? shape(eventStatus.json) : null })

// 4 live event
const live = await get(`/api/event/${currentGw}/live/`)
results.push({ ...live, shape: live.json ? shape(live.json) : null })

// 5 element-summary
if (sampleElementId) {
  const el = await get(`/api/element-summary/${sampleElementId}/`)
  results.push({ ...el, shape: el.json ? shape(el.json) : null, sampleElementId })
}

// 6 dream-team
const dream = await get(`/api/dream-team/${currentGw}/`)
results.push({ ...dream, shape: dream.json ? shape(dream.json) : null })

// Find a public entry id from bootstrap leagues or use known test ids
const testEntryIds = [1, 243693, 4921, 6586]
let entryId = null
let entryPayload = null
for (const id of testEntryIds) {
  const r = await get(`/api/entry/${id}/`)
  if (r.ok && r.json?.id) { entryId = id; entryPayload = r.json; results.push({ ...r, shape: shape(r.json), sample: pick(r.json, ['id','name','player_first_name','player_last_name','summary_overall_points','summary_overall_rank','current_event','last_deadline_bank','last_deadline_value']) }); break }
  results.push({ probe: 'entry-search', id, status: r.status, ok: r.ok })
}

if (entryId) {
  for (const [label, path] of [
    ['history', `/api/entry/${entryId}/history/`],
    ['transfers', `/api/entry/${entryId}/transfers/`],
    [`picks-gw${currentGw}`, `/api/entry/${entryId}/event/${currentGw}/picks/`],
    ['picks-gw1', `/api/entry/${entryId}/event/1/picks/`],
  ]) {
    const r = await get(path)
    results.push({ label, ...r, shape: r.json ? shape(r.json) : null })
    if (r.json && label.startsWith('picks')) {
      const picks = r.json.picks ?? []
      results.push({ label: `${label}-sample-pick`, sample: picks[0] ? pick(picks[0], ['element','position','multiplier','is_captain','is_vice_captain']) : null, automaticSubs: r.json.automatic_subs, activeChip: r.json.active_chip, entryHistory: r.json.entry_history ? pick(r.json.entry_history, ['event','points','bank','value','event_transfers','event_transfers_cost','total_points']) : null })
    }
    if (r.json && label === 'history') {
      const currentArr = r.json.current ?? []
      results.push({ label: 'history-current-sample', sample: currentArr[0] ? pick(currentArr[0], ['event','points','total_points','bank','value','event_transfers','event_transfers_cost','rank','overall_rank']) : null, chips: r.json.chips?.slice?.(0,2) })
    }
    if (r.json && label === 'transfers') {
      results.push({ label: 'transfers-sample', sample: (r.json ?? []).slice?.(0,1)?.[0] ? pick((r.json ?? [])[0], ['element_in','element_in_cost','element_out','element_out_cost','entry','event','time']) : null })
    }
  }
}

// Player code URL patterns (HTML vs API)
const codePaths = [
  `/api/entry/by-player-code/${sampleCode}/`,
  `/api/entry/by-code/${sampleCode}/`,
  `/api/player/${sampleCode}/`,
  `/api/entry/${sampleCode}/`,
]
for (const path of codePaths) {
  const r = await get(path)
  results.push({ probe: 'player-code-lookup', path, status: r.status, ok: r.ok, textSample: r.textSample?.slice(0, 120) })
}

// Summary stdout
console.log(JSON.stringify({
  probedAt: new Date().toISOString(),
  currentGw,
  sampleElementId,
  sampleCode,
  entryId,
  bootstrapTopKeys: root ? Object.keys(root) : [],
  eventFlags: events.slice(0, 3).map(e => pick(e, ['id','name','is_current','is_next','finished','deadline_time'])),
  elementSample: samplePlayer ? pick(samplePlayer, ['id','code','web_name','team','element_type','now_cost','status','ep_next','selected_by_percent']) : null,
  entrySample: entryPayload ? pick(entryPayload, ['id','name','started_event','current_event','last_deadline_bank','last_deadline_value']) : null,
  results,
}, null, 2))
