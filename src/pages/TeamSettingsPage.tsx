import { Button, Label, Spinner, Stack, TextField } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { FplLiveFetchError, loadOfficialLiveSnapshot } from '../data/fplLiveSource'
import { fetchManagerState, joinSquadPickCodes } from '../data/fplUserSource'
import { formatGbpFromTenths } from '../data/prices'
import type { ManagerSnapshot } from '../data/types'
import { ExplorerScreen } from './ExplorerScreen'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; snapshot: ManagerSnapshot; captainName: string | null }

export function TeamSettingsPage() {
  const [entryIdInput, setEntryIdInput] = useState('1')
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  const entryId = useMemo(() => Number.parseInt(entryIdInput.trim(), 10), [entryIdInput])

  async function loadTeam() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setState({ kind: 'error', message: 'Enter a positive FPL entry ID (from your team URL).' })
      return
    }

    setState({ kind: 'loading' })
    try {
      const [snapshot, live] = await Promise.all([
        fetchManagerState(entryId),
        loadOfficialLiveSnapshot(),
      ])
      const codeByElementId = new Map(live.players.map((player) => [player.id, player.code]))
      const nameByElementId = new Map(live.players.map((player) => [player.id, player.webName]))
      const picksWithCodes = joinSquadPickCodes(snapshot.picks.picks, codeByElementId)
      const captain = picksWithCodes.find((pick) => pick.isCaptain)
      const captainName = captain ? (nameByElementId.get(captain.elementId) ?? null) : null
      setState({
        kind: 'success',
        snapshot: {
          ...snapshot,
          picks: { ...snapshot.picks, picks: picksWithCodes },
        },
        captainName,
      })
    } catch (error) {
      const message =
        error instanceof FplLiveFetchError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load manager data.'
      setState({ kind: 'error', message })
    }
  }

  return (
    <ExplorerScreen
      kicker="My team"
      title="Entry settings"
      question="Load your FPL entry by numeric ID to validate the manager API client (LT-1 stub — no Dexie persistence yet)."
      hideSeasonBar
    >
      <Stack gap="md" className="fpl-team-settings">
        <Stack gap="sm">
          <Label htmlFor="fpl-entry-id">FPL entry ID</Label>
          <TextField
            id="fpl-entry-id"
            inputMode="numeric"
            value={entryIdInput}
            onChange={(event) => setEntryIdInput(event.target.value)}
            placeholder="e.g. 1"
          />
          <p className="fpl-explorer__question">
            Find this in your team URL: fantasy.premierleague.com/entry/<strong>1234567</strong>/event/…
          </p>
          <Button variant="primary" onClick={() => void loadTeam()} disabled={state.kind === 'loading'}>
            {state.kind === 'loading' ? 'Loading…' : 'Load team'}
          </Button>
        </Stack>

        {state.kind === 'loading' ? (
          <Spinner label="Fetching entry, picks, and history via /fpl-api…" />
        ) : null}

        {state.kind === 'error' ? (
          <p className="fpl-team-settings__error" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.kind === 'success' ? (
          <dl className="fpl-team-settings__summary">
            <div>
              <dt>Team</dt>
              <dd>{state.snapshot.entry.identity.teamName}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>
                {state.snapshot.entry.identity.playerFirstName}{' '}
                {state.snapshot.entry.identity.playerLastName}
              </dd>
            </div>
            <div>
              <dt>Current GW</dt>
              <dd>{state.snapshot.event}</dd>
            </div>
            <div>
              <dt>Bank</dt>
              <dd>{formatGbpFromTenths(state.snapshot.picks.entryHistory.bankTenths)}</dd>
            </div>
            <div>
              <dt>Squad value</dt>
              <dd>{formatGbpFromTenths(state.snapshot.picks.entryHistory.squadValueTenths)}</dd>
            </div>
            <div>
              <dt>Picks</dt>
              <dd>{state.snapshot.picks.picks.length}</dd>
            </div>
            <div>
              <dt>Captain</dt>
              <dd>{state.captainName ?? '—'}</dd>
            </div>
            <div>
              <dt>Season GW rows</dt>
              <dd>{state.snapshot.history.current.length}</dd>
            </div>
            <div>
              <dt>Chips played</dt>
              <dd>{state.snapshot.history.chips.length}</dd>
            </div>
          </dl>
        ) : null}
      </Stack>
    </ExplorerScreen>
  )
}
