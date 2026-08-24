import { useEffect } from 'react'
import { bootRefreshUserStateIfStale } from '../data/userStateRefresh'

/** Trigger background user-state refresh on mount when configured entry is stale. */
export function useUserStateBootRefresh(): void {
  useEffect(() => {
    void bootRefreshUserStateIfStale()
  }, [])
}
