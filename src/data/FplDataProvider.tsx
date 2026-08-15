import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FplDataContext } from './fplDataContext'
import { loadSeasonCatalog, loadSeasonSnapshot } from './ingest'
import type { SeasonCatalogEntry, SeasonSnapshot } from './types'

const STORAGE_KEY = 'fpl.vaastav.season'

function readStoredSeason(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredSeason(seasonId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, seasonId)
  } catch {
    /* ignore quota */
  }
}

function preferredSeasonId(catalog: SeasonCatalogEntry[], stored: string | null): string {
  if (stored && catalog.some((entry) => entry.seasonId === stored)) return stored
  const historical = [...catalog].reverse().find((entry) => entry.kind === 'historical')
  return historical?.seasonId ?? catalog[catalog.length - 1]?.seasonId ?? ''
}

export function FplDataProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<SeasonCatalogEntry[]>([])
  const [seasonId, setSeasonIdState] = useState('')
  const [snapshot, setSnapshot] = useState<SeasonSnapshot | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = useCallback(async (requested: string, force: boolean) => {
    try {
      const entries = await loadSeasonCatalog({ force })
      const resolved = requested || preferredSeasonId(entries, readStoredSeason())
      const kind = entries.find((entry) => entry.seasonId === resolved)?.kind
      const next = resolved
        ? await loadSeasonSnapshot(resolved, { force, kind })
        : null
      setCatalog(entries)
      setSeasonIdState(resolved)
      setSnapshot(next)
      setError(null)
      setStatus('ready')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Failed to load published FPL data')
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const entries = await loadSeasonCatalog({ force: false })
        if (ac.signal.aborted) return
        const resolved = preferredSeasonId(entries, readStoredSeason())
        const kind = entries.find((entry) => entry.seasonId === resolved)?.kind
        const next = resolved
          ? await loadSeasonSnapshot(resolved, { force: false, kind })
          : null
        if (ac.signal.aborted) return
        setCatalog(entries)
        setSeasonIdState(resolved)
        setSnapshot(next)
        setError(null)
        setStatus('ready')
      } catch (cause) {
        if (ac.signal.aborted) return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : 'Failed to load published FPL data')
      }
    })()
    return () => ac.abort()
  }, [])

  const setSeasonId = useCallback(
    (next: string) => {
      writeStoredSeason(next)
      setStatus('loading')
      void loadSnapshot(next, false)
    },
    [loadSnapshot],
  )

  const refresh = useCallback(async () => {
    setStatus('loading')
    await loadSnapshot(seasonId, true)
  }, [loadSnapshot, seasonId])

  const value = useMemo(
    () => ({
      catalog,
      seasonId,
      setSeasonId,
      snapshot,
      status,
      error,
      refresh,
    }),
    [catalog, error, refresh, seasonId, setSeasonId, snapshot, status],
  )

  return <FplDataContext.Provider value={value}>{children}</FplDataContext.Provider>
}
