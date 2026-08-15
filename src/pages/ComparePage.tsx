import { Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { PlayerLabel } from '../components/FplMedia'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import { formSeries, playerPriceLabel } from '../data/queries'
import { DataTable, ExplorerEmpty, ExplorerScreen, FormSlot } from './ExplorerScreen'

export function ComparePage() {
  const { snapshot } = useFplData()
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const players = useMemo(
    () =>
      [...(snapshot?.players ?? [])].sort((a, b) =>
        playerDisplayName(a).localeCompare(playerDisplayName(b)),
      ),
    [snapshot],
  )
  const left = players.find((player) => String(player.id) === leftId)
  const right = players.find((player) => String(player.id) === rightId)

  const options = (
    <>
      <option value="">Choose a player</option>
      {players.map((player) => (
        <option key={player.id} value={player.id}>
          {playerDisplayName(player)}
        </option>
      ))}
    </>
  )

  const compareRows =
    left && right
      ? [
          {
            metric: 'Name',
            a: <PlayerLabel player={left} />,
            b: <PlayerLabel player={right} />,
            sortA: playerDisplayName(left),
            sortB: playerDisplayName(right),
          },
          {
            metric: 'Position',
            a: left.position,
            b: right.position,
            sortA: left.position,
            sortB: right.position,
          },
          {
            metric: 'Price',
            a: playerPriceLabel(left),
            b: playerPriceLabel(right),
            sortA: left.nowCostTenths,
            sortB: right.nowCostTenths,
          },
          {
            metric: 'Season pts',
            a: left.totalPoints,
            b: right.totalPoints,
            sortA: left.totalPoints,
            sortB: right.totalPoints,
          },
          {
            metric: 'Minutes',
            a: left.minutes,
            b: right.minutes,
            sortA: left.minutes,
            sortB: right.minutes,
          },
          {
            metric: 'Goals',
            a: left.goalsScored,
            b: right.goalsScored,
            sortA: left.goalsScored,
            sortB: right.goalsScored,
          },
          {
            metric: 'Assists',
            a: left.assists,
            b: right.assists,
            sortA: left.assists,
            sortB: right.assists,
          },
        ]
      : []

  return (
    <ExplorerScreen
      kicker="Compare"
      title="Two-player compare"
      question="Between these two, who better answers this week's need?"
    >
      <div className="fpl-explorer__compare">
        <Label className="fpl-explorer__field">
          Player A
          <Select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
            {options}
          </Select>
        </Label>
        <Label className="fpl-explorer__field">
          Player B
          <Select value={rightId} onChange={(event) => setRightId(event.target.value)}>
            {options}
          </Select>
        </Label>
      </div>

      {!left || !right ? (
        <ExplorerEmpty
          title="No players chosen"
          description="Pick two published names. Both sides stay empty until then so we never show invented points or prices."
        />
      ) : (
        <div className="fpl-explorer__compare">
          <PlayerLabel player={left} size={48} />
          <PlayerLabel player={right} size={48} />
        </div>
      )}

      <div className="fpl-explorer__compare">
        <FormSlot
          label={left ? `${playerDisplayName(left)} form` : 'Player A form'}
          data={left && snapshot ? formSeries(snapshot.performances, left.id) : []}
        />
        <FormSlot
          label={right ? `${playerDisplayName(right)} form` : 'Player B form'}
          data={right && snapshot ? formSeries(snapshot.performances, right.id) : []}
        />
      </div>
      <DataTable
        caption="Side-by-side"
        columns={[
          {
            id: 'metric',
            label: 'Metric',
            sortValue: (row) => row.metric,
            render: (row) => row.metric,
          },
          {
            id: 'a',
            label: 'Player A',
            sortValue: (row) => row.sortA,
            render: (row) => row.a,
          },
          {
            id: 'b',
            label: 'Player B',
            sortValue: (row) => row.sortB,
            render: (row) => row.b,
          },
        ]}
        rows={compareRows}
        rowKey={(row) => row.metric}
        empty="Choose both players to fill this table from published files."
      />
    </ExplorerScreen>
  )
}
