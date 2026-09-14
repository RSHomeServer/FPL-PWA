import { Button, Label, Spinner, Stack, TextField } from '@songara/pwa-base/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_OPTIMISER_FORMULA_SETTINGS,
  readAppSettings,
  writeAppSettings,
  type OptimiserFormulaSettings,
} from '../data/appSettings'
import { getFplCacheDb } from '../data/db'
import type { UserProfileRecord } from '../data/types'
import {
  loadCachedUserStateAfterFailure,
  readConfiguredEntryId,
  refreshUserState,
} from '../data/userStateRefresh'
import { ExplorerScreen } from './ExplorerScreen'
import './ExplorerPages.css'

type EntryVerifyState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'verified'; profile: UserProfileRecord; fetchedAt: number; servingCached: boolean }

function formatRefreshTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

function formatRank(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) return '—'
  return rank.toLocaleString()
}

type FormulaFieldProps = {
  id: string
  label: string
  hint: string
  min: number
  max: number
  step: number
  value: number
  display: (value: number) => string
  onChange: (value: number) => void
}

function FormulaField({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: FormulaFieldProps) {
  return (
    <Label className="fpl-explorer__field fpl-settings__field" htmlFor={id}>
      <span className="fpl-settings__field-head">
        <span>{label}</span>
        <span className="fpl-settings__field-value">{display(value)}</span>
      </span>
      <input
        id={id}
        className="fpl-settings__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="fpl-explorer__meta">{hint}</span>
    </Label>
  )
}

export function SettingsPage() {
  const [entryIdInput, setEntryIdInput] = useState('')
  const [entryState, setEntryState] = useState<EntryVerifyState>({ kind: 'idle' })
  const [formula, setFormula] = useState<OptimiserFormulaSettings>(DEFAULT_OPTIMISER_FORMULA_SETTINGS)
  const [formulaSaved, setFormulaSaved] = useState(false)

  const entryId = useMemo(() => Number.parseInt(entryIdInput.trim(), 10), [entryIdInput])

  const loadCachedProfile = useCallback(async (configured: number) => {
    const profile = await getFplCacheDb().userProfile.get(configured)
    if (!profile) return
    setEntryState({
      kind: 'verified',
      profile,
      fetchedAt: profile.lastRefreshAt,
      servingCached: true,
    })
  }, [])

  useEffect(() => {
    void (async () => {
      setFormula(readAppSettings().optimiser)
      const configured = await readConfiguredEntryId()
      if (!configured) return
      setEntryIdInput(String(configured))
      await loadCachedProfile(configured)
    })()
  }, [loadCachedProfile])

  async function verifyEntry() {
    if (!Number.isFinite(entryId) || entryId <= 0) {
      setEntryState({
        kind: 'error',
        message: 'Enter a positive FPL entry ID (from your team URL).',
      })
      return
    }

    setEntryState({ kind: 'loading' })
    try {
      const snapshot = await refreshUserState(entryId, { force: true })
      const profile = await getFplCacheDb().userProfile.get(entryId)
      if (!profile) {
        setEntryState({ kind: 'error', message: 'Entry verified but profile was not persisted.' })
        return
      }
      setEntryState({
        kind: 'verified',
        profile,
        fetchedAt: snapshot.fetchedAt,
        servingCached: false,
      })
    } catch (error) {
      const cached = await loadCachedUserStateAfterFailure(entryId)
      if (cached) {
        const profile = await getFplCacheDb().userProfile.get(entryId)
        if (profile) {
          setEntryState({
            kind: 'verified',
            profile,
            fetchedAt: cached.lastRefreshAt,
            servingCached: true,
          })
          return
        }
      }
      const message = error instanceof Error ? error.message : 'Failed to verify entry ID.'
      setEntryState({ kind: 'error', message })
    }
  }

  function saveFormulaSettings() {
    writeAppSettings({ optimiser: formula })
    setFormulaSaved(true)
    window.setTimeout(() => setFormulaSaved(false), 2500)
  }

  function resetFormulaSettings() {
    setFormula(DEFAULT_APP_SETTINGS.optimiser)
  }

  return (
    <ExplorerScreen
      kicker="Settings"
      title="Global preferences"
      question="Configure your FPL entry and tune how the transfer optimiser weights recent performance."
      hideSeasonBar
    >
      <Stack gap="lg" className="fpl-settings">
        <section className="fpl-settings__section" aria-labelledby="fpl-settings-entry">
          <h2 id="fpl-settings-entry" className="fpl-settings__section-title">
            FPL entry
          </h2>
          <p className="fpl-explorer__meta">
            Your entry ID links the optimiser to your squad, bank, and transfer history. Data is
            cached locally and refreshed every 30 minutes or on demand from the{' '}
            <Link to="/optimiser">optimiser</Link> page.
          </p>
          <Stack gap="sm" className="fpl-settings__form">
            <Label className="fpl-explorer__field" htmlFor="fpl-settings-entry-id">
              Entry ID
              <TextField
                id="fpl-settings-entry-id"
                inputMode="numeric"
                value={entryIdInput}
                onChange={(event) => setEntryIdInput(event.target.value)}
                placeholder="e.g. 8585919"
                autoComplete="off"
              />
            </Label>
            <p className="fpl-explorer__meta">
              From your team URL: fantasy.premierleague.com/entry/<strong>1234567</strong>/event/…
            </p>
            <Stack direction="row" gap="sm" className="fpl-settings__actions">
              <Button
                variant="primary"
                onClick={() => void verifyEntry()}
                disabled={entryState.kind === 'loading'}
              >
                {entryState.kind === 'loading' ? 'Verifying…' : 'Verify & save'}
              </Button>
            </Stack>
          </Stack>

          {entryState.kind === 'loading' ? (
            <Spinner label="Fetching entry from /fpl-api…" />
          ) : null}
          {entryState.kind === 'error' ? (
            <p className="fpl-settings__error" role="alert">
              {entryState.message}
            </p>
          ) : null}
          {entryState.kind === 'verified' ? (
            <>
              {entryState.servingCached ? (
                <p className="fpl-settings__banner" role="status">
                  Showing cached entry data — live refresh failed. Check your connection and try
                  again.
                </p>
              ) : null}
              <dl className="fpl-settings__summary">
                <div>
                  <dt>Entry ID</dt>
                  <dd>{entryState.profile.entryId}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{entryState.profile.teamName}</dd>
                </div>
                <div>
                  <dt>Manager</dt>
                  <dd>
                    {entryState.profile.playerFirstName} {entryState.profile.playerLastName}
                  </dd>
                </div>
                <div>
                  <dt>Overall rank</dt>
                  <dd>{formatRank(entryState.profile.summaryOverallRank)}</dd>
                </div>
                <div>
                  <dt>Overall points</dt>
                  <dd>{entryState.profile.summaryOverallPoints}</dd>
                </div>
                <div>
                  <dt>Last verified</dt>
                  <dd>{formatRefreshTime(entryState.fetchedAt)}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </section>

        <section className="fpl-settings__section" aria-labelledby="fpl-settings-optimiser">
          <h2 id="fpl-settings-optimiser" className="fpl-settings__section-title">
            Optimiser formula
          </h2>
          <p className="fpl-explorer__meta">
            Controls how in-season expected points blend prior-season data with current form, last
            gameweek scores, and fixture difficulty. Changes apply the next time projections run on
            the <Link to="/optimiser">optimiser</Link> page.
          </p>
          <Stack gap="md" className="fpl-settings__formula">
            <FormulaField
              id="fpl-settings-current-shrinkage"
              label="Current-season trust (minutes)"
              hint="Lower values react faster to this season’s minutes played (default 270). GW0 priors still use 900."
              min={90}
              max={900}
              step={30}
              value={formula.currentShrinkageMinutesRef}
              display={(value) => `${value} min`}
              onChange={(value) =>
                setFormula((current) => ({ ...current, currentShrinkageMinutesRef: value }))
              }
            />
            <FormulaField
              id="fpl-settings-last-gw-weight"
              label="Last gameweek emphasis"
              hint="How much the most recent GW points/90 can lift the live rate after a full appearance."
              min={0}
              max={0.6}
              step={0.05}
              value={formula.lastGwWeight}
              display={(value) => `${Math.round(value * 100)}% max`}
              onChange={(value) => setFormula((current) => ({ ...current, lastGwWeight: value }))}
            />
            <FormulaField
              id="fpl-settings-form-weight"
              label="FPL form emphasis"
              hint="Weight for bootstrap form (recent average points). Strong form ≥6 gets full slot."
              min={0}
              max={0.5}
              step={0.05}
              value={formula.formWeight}
              display={(value) => `${Math.round(value * 100)}% max`}
              onChange={(value) => setFormula((current) => ({ ...current, formWeight: value }))}
            />
            <FormulaField
              id="fpl-settings-overlay-cap"
              label="Recency overlay cap"
              hint="Maximum combined influence of last GW + form overlays on the final live rate."
              min={0.1}
              max={0.9}
              step={0.05}
              value={formula.recencyOverlayCap}
              display={(value) => `${Math.round(value * 100)}% cap`}
              onChange={(value) =>
                setFormula((current) => ({ ...current, recencyOverlayCap: value }))
              }
            />
            <FormulaField
              id="fpl-settings-starts-minutes"
              label="Starts-rate trust (minutes)"
              hint="Minutes before we fully trust this season’s start rate over the prior (default 180)."
              min={45}
              max={900}
              step={15}
              value={formula.startsSmallSampleMinutes}
              display={(value) => `${value} min`}
              onChange={(value) =>
                setFormula((current) => ({ ...current, startsSmallSampleMinutes: value }))
              }
            />
          </Stack>
          <Stack direction="row" gap="sm" className="fpl-settings__actions">
            <Button variant="primary" onClick={saveFormulaSettings}>
              Save formula settings
            </Button>
            <Button variant="secondary" onClick={resetFormulaSettings}>
              Reset to defaults
            </Button>
          </Stack>
          {formulaSaved ? (
            <p className="fpl-settings__saved" role="status">
              Formula settings saved.
            </p>
          ) : null}
        </section>
      </Stack>
    </ExplorerScreen>
  )
}
