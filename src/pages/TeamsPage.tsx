import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
  FormSlot,
} from './ExplorerScreen'

export function TeamsPage() {
  return (
    <ExplorerScreen
      kicker="Teams"
      title="Team comparison"
      question="Which sides look stronger to target or avoid over the next few gameweeks?"
    >
      <ExplorerEmpty
        title="No team table yet"
        description="Club-level comparison waits on the data layer. This screen is the place that work will bind to."
      />
      <EmptyTable
        caption="Team snapshot (placeholder)"
        columns={['Team', 'Attack', 'Defence', 'Next fixtures']}
      />
      <FormSlot label="Relative strength (empty)" />
    </ExplorerScreen>
  )
}
