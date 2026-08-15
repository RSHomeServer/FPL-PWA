import { createContext, useContext } from 'react'
import type { SeasonCatalogEntry, SeasonSnapshot } from './types'

export type FplDataStatus = 'loading' | 'ready' | 'error'

export type FplDataContextValue = {
  catalog: SeasonCatalogEntry[]
  seasonId: string
  setSeasonId: (seasonId: string) => void
  snapshot: SeasonSnapshot | null
  status: FplDataStatus
  error: string | null
  refresh: () => Promise<void>
}

export const FplDataContext = createContext<FplDataContextValue | null>(null)

export function useFplData(): FplDataContextValue {
  const value = useContext(FplDataContext)
  if (!value) {
    throw new Error('useFplData must be used within FplDataProvider')
  }
  return value
}
