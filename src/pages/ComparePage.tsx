import { Label, Select } from '@songara/pwa-base/ui'
import { useMemo, useState } from 'react'
import { useFplData } from '../data/fplDataContext'
import { playerDisplayName } from '../data/parse'
import { formSparkline, playerPriceLabel } from '../data/queries'
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
      ) : null}

      <div className="fpl-explorer__compare">
        <FormSlot
          label={left ? `${playerDisplayName(left)} form` : 'Player A form'}
          data={left && snapshot ? formSparkline(snapshot.performances, left.id) : []}
        />
        <FormSlot
          label={right ? `${playerDisplayName(right)} form` : 'Player B form'}
          data={right && snapshot ? formSparkline(snapshot.performances, right.id) : []}
        />
      </div>
      <DataTable
        caption="Side-by-side"
        columns={['Metric', 'Player A', 'Player B']}
        rows={
          left && right
            ? [
                ['Name', playerDisplayName(left), playerDisplayName(right)],
                ['Position', left.position, right.position],
                ['Price', playerPriceLabel(left), playerPriceLabel(right)],
                ['Season pts', left.totalPoints, right.totalPoints],
                ['Minutes', left.minutes, right.minutes],
                ['Goals', left.goalsScored, right.goalsScored],
                ['Assists', left.assists, right.assists],
              ]
            : []
        }
        empty="Choose both players to fill this table from published files."
      />
    </ExplorerScreen>
  )
}
