import {
  EmptyTable,
  ExplorerEmpty,
  ExplorerScreen,
  FormSlot,
} from './ExplorerScreen'

export function ComparePage() {
  return (
    <ExplorerScreen
      kicker="Compare"
      title="Two-player compare"
      question="Between these two, who better answers this week's need?"
    >
      <ExplorerEmpty
        title="No players chosen"
        description="Pick two names once the player list exists. Until then both sides stay empty so we never show invented points or prices."
      />
      <div className="fpl-explorer__compare">
        <FormSlot label="Player A form" />
        <FormSlot label="Player B form" />
      </div>
      <EmptyTable
        caption="Side-by-side (placeholder)"
        columns={['Metric', 'Player A', 'Player B']}
      />
    </ExplorerScreen>
  )
}
