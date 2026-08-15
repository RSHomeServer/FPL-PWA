import { Button, Label, Select, Spinner } from '@songara/pwa-base/ui'
import { useFplData } from '../data/fplDataContext'

export function SeasonBar() {
  const { catalog, seasonId, setSeasonId, snapshot, status, error, refresh } = useFplData()
  const kind = catalog.find((entry) => entry.seasonId === seasonId)?.kind
  const revision = snapshot?.meta.sourceRevision
  const fetched = snapshot?.meta.fetchedAt
    ? new Date(snapshot.meta.fetchedAt).toLocaleString()
    : null

  return (
    <div className="fpl-explorer__toolbar">
      <Label className="fpl-explorer__field">
        Season
        <Select
          value={seasonId}
          disabled={catalog.length === 0}
          onChange={(event) => setSeasonId(event.target.value)}
        >
          {catalog.map((entry) => (
            <option key={entry.seasonId} value={entry.seasonId}>
              {entry.seasonId}
              {entry.kind === 'current' ? ' (current)' : ''}
            </option>
          ))}
        </Select>
      </Label>
      <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={status === 'loading'}>
        Refresh
      </Button>
      {status === 'loading' ? <Spinner size="sm" label="Loading published data" /> : null}
      <p className="fpl-explorer__meta">
        {error ? error : null}
        {!error && kind ? `${kind} snapshot` : null}
        {!error && revision ? ` · ${revision}` : null}
        {!error && fetched ? ` · ${fetched}` : null}
      </p>
    </div>
  )
}
