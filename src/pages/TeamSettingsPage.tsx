import { Button, Label, Spinner, Stack, TextField } from '@songara/pwa-base/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadOfficialLiveSnapshot } from '../data/fplLiveSource'
import { formatGbpFromTenths } from '../data/prices'
import type { ManagerSnapshot } from '../data/types'
import {
  loadCachedUserStateAfterFailure,
  loadUserState,
  readConfiguredEntryId,
  refreshUserState,
} from '../data/userStateRefresh'
import { ExplorerScreen } from './ExplorerScreen'

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'success'
      snapshot: ManagerSnapshot
      captainName: string | null
      lastRefreshAt: number
      servingCached: boolean
    }

function formatRefreshTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

async function captainNameForSnapshot(snapshot: ManagerSnapshot): Promise<string | null> {
  const live = await loadOfficialLiveSnapshot()
  const nameByElementId = new Map(live.players.map((player) => [player.id, player.webName]))
  const captain = snapshot.picks.picks.find((pick) => pick.isCaptain)
  return captain ? (nameByElementId.get(captain.elementId) ?? null) : null
}

export function TeamSettingsPage() {
  const [entryIdInput, setEntryIdInput] = useState('')
  const [state, setState] = useState<ViewState>({ kind: 'idle' })

  const entryId = useMemo(() => Number.parseInt(entryIdInput.trim(), 10), [entryIdInput])

  const applySuccess = useCallback(async (
    snapshot: ManagerSnapshot,
    lastRefreshAt: number,
    servingCached: boolean,
  ) => {
    const captainName = await captainNameForSnapshot(snapshot)
    setState({
      kind: 'success',
      snapshot,
      captainName,
      lastRefreshAt,
      servingCached,
    })
  }, [])

  useEffect(() => {
    void (async () => {
      const configured = await readConfiguredEntryId()
      if (!configured) return
      setEntryIdInput(String(configured))
      const loaded = await loadUserState(configured, { triggerBackgroundRefresh: true })
      if (!loaded) return
      await applySuccess(loaded.snapshot, loaded.lastRefreshAt, loaded.servingCached)
    })()
  }, [applySuccess])

  async function loadTeam() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setState({ kind: 'error', message: 'Enter a positive FPL entry ID (from your team URL).' })
      return
    }

    setState({ kind: 'loading' })
    try {
      const snapshot = await refreshUserState(entryId, { force: true })
      await applySuccess(snapshot, snapshot.fetchedAt, false)
    } catch (error) {
      const cached = await loadCachedUserStateAfterFailure(entryId)
      if (cached) {
        await applySuccess(cached.snapshot, cached.lastRefreshAt, true)
        return
      }
      const message =
        error instanceof Error ? error.message : 'Failed to load manager data.'
      setState({ kind: 'error', message })
    }
  }

  async function refreshTeam() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setState({ kind: 'error', message: 'Configure an entry ID before refreshing.' })
      return
    }

    setState({ kind: 'loading' })
    try {
      const snapshot = await refreshUserState(entryId, { force: true })
      await applySuccess(snapshot, snapshot.fetchedAt, false)
    } catch (error) {
      const cached = await loadCachedUserStateAfterFailure(entryId)
      if (cached) {
        await applySuccess(cached.snapshot, cached.lastRefreshAt, true)
        return
      }
      const message =
        error instanceof Error ? error.message : 'Failed to refresh manager data.'
      setState({ kind: 'error', message })
    }
  }

  const hasConfiguredEntry = state.kind === 'success' || (Number.isFinite(entryId) && entryId > 0)

  return (
    <ExplorerScreen
      kicker="My team"
      title="Entry settings"
      question="Load your FPL entry by numeric ID. Squad data is cached locally and refreshed every 30 minutes (or on demand)."
      hideSeasonBar
    >
      <Stack gap="md" className="fpl-team-settings">
        <Stack gap="sm" className="fpl-team-settings__form">
          <Label className="fpl-explorer__field" htmlFor="fpl-entry-id">
            FPL entry ID
            <TextField
              id="fpl-entry-id"
              inputMode="numeric"
              value={entryIdInput}
              onChange={(event) => setEntryIdInput(event.target.value)}
              placeholder="e.g. 8585919"
              autoComplete="off"
            />
          </Label>
          <p className="fpl-explorer__meta">
            Find this in your team URL: fantasy.premierleague.com/entry/<strong>1234567</strong>/event/…
          </p>
          <Stack gap="sm" className="fpl-team-settings__actions">
            <Button
              variant="primary"
              onClick={() => void loadTeam()}
              disabled={state.kind === 'loading'}
            >
              {state.kind === 'loading' ? 'Loading…' : 'Load team'}
            </Button>
            {hasConfiguredEntry ? (
              <Button
                variant="secondary"
                onClick={() => void refreshTeam()}
                disabled={state.kind === 'loading'}
              >
                Refresh squad
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {state.kind === 'loading' ? (
          <Spinner label="Fetching entry, picks, history, and transfers via /fpl-api…" />
        ) : null}

        {state.kind === 'error' ? (
          <p className="fpl-team-settings__error" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.kind === 'success' && state.servingCached ? (
          <p className="fpl-team-settings__banner" role="status">
            Showing cached squad — live refresh failed or data is stale. Check your connection and try
            Refresh squad.
          </p>
        ) : null}

        {state.kind === 'success' ? (
          <>
            <p className="fpl-explorer__meta">
              Last refreshed: {formatRefreshTime(state.lastRefreshAt)}
            </p>
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
          </>
        ) : null}
      </Stack>
    </ExplorerScreen>
  )
}
