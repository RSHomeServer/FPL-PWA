import { useMemo, useState, type CSSProperties } from 'react'
import {
  eliteClusterColor,
  type EliteClusterElementShare,
  type EliteClusterTransition,
  type EliteClusteringResult,
  type EliteGwCluster,
  type EliteGwClustering,
} from '../analysis/eliteCluster'
import {
  enrichElitePitchPlayer,
  meanUpcomingFdr,
  type ElitePitchEnrichment,
} from '../analysis/elitePitchEnrichment'
import { FplPitch, type PitchPlayer } from '../components/FplPitch'
import { PlayerPhoto, TeamCrest } from '../components/FplMedia'
import { pitchLineOf } from '../components/fplPitchLayout'
import { teamTintColor } from '../data/teamColors'
import type { EliteEntryRecord, EliteGameweekSquad, FplPlayer, FplTeam } from '../data/types'

type EliteClusterPanelProps = {
  entries: EliteEntryRecord[]
  clustering: EliteClusteringResult
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  onSelectEntry: (entryId: number) => void
  activeGw: number | null
  onActiveGwChange: (gw: number) => void
}

export function EliteClusterPanel({
  entries,
  clustering,
  playersById,
  teamsById,
  onSelectEntry,
  activeGw,
  onActiveGwChange,
}: EliteClusterPanelProps) {
  const gameweeks = clustering.byGw.map((row) => row.gw)
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null)
  const [hoverFlow, setHoverFlow] = useState<string | null>(null)

  const resolvedGw = activeGw ?? gameweeks[0] ?? null
  const gwClustering = clustering.byGw.find((row) => row.gw === resolvedGw) ?? null
  const gwIndex = clustering.byGw.findIndex((row) => row.gw === resolvedGw)
  const prevClustering = gwIndex > 0 ? clustering.byGw[gwIndex - 1]! : null
  const nextClustering =
    gwIndex >= 0 && gwIndex < clustering.byGw.length - 1 ? clustering.byGw[gwIndex + 1]! : null

  const flowFrom = prevClustering ?? gwClustering
  const flowTo = prevClustering ? gwClustering : nextClustering
  const transitions = useMemo(() => {
    if (!flowFrom || !flowTo) return []
    return clustering.transitions.filter(
      (row) => row.fromGw === flowFrom.gw && row.toGw === flowTo.gw,
    )
  }, [clustering.transitions, flowFrom, flowTo])

  const entryById = useMemo(() => {
    const map = new Map<number, EliteEntryRecord>()
    for (const entry of entries) map.set(entry.entryId, entry)
    return map
  }, [entries])

  function elementName(elementId: number): string {
    return playersById.get(elementId)?.webName ?? `#${elementId}`
  }

  function clusterTitle(cluster: EliteGwCluster): string {
    const names = cluster.signatureElementIds.map(elementName).filter(Boolean)
    return names.length ? names.slice(0, 3).join(' · ') : cluster.label
  }

  function selectCluster(clusterId: number) {
    setSelectedClusterId((prev) => (prev === clusterId ? null : clusterId))
    setSelectedElementId(null)
  }

  function selectElement(elementId: number) {
    setSelectedElementId((prev) => (prev === elementId ? null : elementId))
  }

  if (gameweeks.length === 0) {
    return (
      <section className="fpl-perfect-summary">
        <h2 className="fpl-explorer__title">Clusters</h2>
        <p className="fpl-explorer__meta">
          Need at least 8 entries with a full squad in a gameweek before clustering runs.
        </p>
      </section>
    )
  }

  const selectedCluster =
    gwClustering?.clusters.find((cluster) => cluster.id === selectedClusterId) ?? null

  return (
    <section className="fpl-elite-clusters">
      <div className="fpl-elite-clusters__head">
        <h2 className="fpl-explorer__title">Squad clusters by gameweek</h2>
        <p className="fpl-explorer__meta">
          Jaccard k-medoids on 15-man sets (k≈6). Names and colours stay stable across weeks when the
          medoid squad stays similar. Ownership % is within that cluster (not the whole sample). The
          transition diagram sits under the cluster cards.
        </p>
      </div>

      <div className="fpl-elite-clusters__gw-tabs" role="tablist" aria-label="Gameweek">
        {gameweeks.map((gw) => (
          <button
            key={gw}
            type="button"
            role="tab"
            aria-selected={gw === resolvedGw}
            className={
              gw === resolvedGw ? 'fpl-elite-clusters__gw-tab is-active' : 'fpl-elite-clusters__gw-tab'
            }
            onClick={() => {
              onActiveGwChange(gw)
              setSelectedClusterId(null)
              setSelectedElementId(null)
            }}
          >
            GW{gw}
          </button>
        ))}
      </div>

      {gwClustering ? (
        <>
          <div className="fpl-elite-clusters__stats">
            <span>
              {gwClustering.entryIds.length} teams · {gwClustering.k} clusters
            </span>
            {flowFrom && flowTo ? (
              <span>
                Transition ribbons: GW{flowFrom.gw} → GW{flowTo.gw} (below)
              </span>
            ) : (
              <span>Need 2+ clustered gameweeks for transition ribbons</span>
            )}
          </div>

          <div className="fpl-elite-clusters__grid">
            {gwClustering.clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                title={clusterTitle(cluster)}
                color={eliteClusterColor(cluster.id)}
                selected={selectedClusterId === cluster.id}
                highlightElementId={selectedElementId}
                playersById={playersById}
                teamsById={teamsById}
                medoidName={entryById.get(cluster.medoidEntryId)?.entryName ?? String(cluster.medoidEntryId)}
                onSelect={() => selectCluster(cluster.id)}
                onSelectElement={selectElement}
              />
            ))}
          </div>

          {flowFrom && flowTo && transitions.length > 0 ? (
            <TransitionDiagram
              from={flowFrom}
              to={flowTo}
              transitions={transitions}
              selectedClusterId={selectedClusterId}
              hoverFlow={hoverFlow}
              titleFor={clusterTitle}
              onHoverFlow={setHoverFlow}
              onSelectFrom={(id) => {
                setSelectedClusterId(id)
                setSelectedElementId(null)
                if (flowFrom === gwClustering) onActiveGwChange(flowFrom.gw)
              }}
              onSelectTo={(id) => {
                setSelectedClusterId(id)
                setSelectedElementId(null)
                if (flowTo) onActiveGwChange(flowTo.gw)
              }}
            />
          ) : null}

          {selectedCluster ? (
            <ClusterDetail
              cluster={selectedCluster}
              title={clusterTitle(selectedCluster)}
              entryById={entryById}
              playersById={playersById}
              teamsById={teamsById}
              onSelectElement={selectElement}
              selectedElementId={selectedElementId}
              onSelectEntry={onSelectEntry}
            />
          ) : null}

          {selectedElementId != null && !selectedCluster ? (
            <ElementAcrossClusters
              elementId={selectedElementId}
              label={elementName(selectedElementId)}
              clustering={gwClustering}
              titleFor={clusterTitle}
              onSelectCluster={selectCluster}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function ClusterCard({
  cluster,
  title,
  color,
  selected,
  highlightElementId,
  playersById,
  teamsById,
  medoidName,
  onSelect,
  onSelectElement,
}: {
  cluster: EliteGwCluster
  title: string
  color: string
  selected: boolean
  highlightElementId: number | null
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  medoidName: string
  onSelect: () => void
  onSelectElement: (id: number) => void
}) {
  const chips = Object.entries(cluster.chipCounts)
    .filter(([chip]) => chip !== 'none')
    .sort((a, b) => b[1] - a[1])
  const xi = cluster.squadElements.filter((row) => row.onXi)
  const bench = cluster.squadElements.filter((row) => !row.onXi)

  return (
    <article
      className={selected ? 'fpl-elite-cluster-card is-selected' : 'fpl-elite-cluster-card'}
      style={{ ['--cluster-color' as string]: color }}
    >
      <button type="button" className="fpl-elite-cluster-card__select" onClick={onSelect}>
        <div className="fpl-elite-cluster-card__head">
          <span className="fpl-elite-cluster-card__swatch" aria-hidden />
          <strong className="fpl-elite-cluster-card__title">{title}</strong>
          <span className="fpl-elite-cluster-card__size">{cluster.size}</span>
        </div>
        <p className="fpl-elite-cluster-card__meta">
          avg {cluster.avgPoints.toFixed(1)} pts
          {cluster.avgOverallRank != null ? ` · rank ~${Math.round(cluster.avgOverallRank).toLocaleString()}` : ''}
        </p>
        <p className="fpl-elite-cluster-card__meta">Medoid · {medoidName}</p>
        {chips.length > 0 ? (
          <p className="fpl-elite-cluster-card__meta">
            Chips · {chips.map(([chip, n]) => `${chip}×${n}`).join(' · ')}
          </p>
        ) : null}
      </button>
      <p className="fpl-elite-cluster-card__section">XI · ownership in cluster</p>
      <ul className="fpl-elite-cluster-card__elements">
        {xi.map((row) => (
          <PlayerChipRow
            key={row.elementId}
            row={row}
            hot={highlightElementId === row.elementId}
            playersById={playersById}
            teamsById={teamsById}
            onSelect={() => onSelectElement(row.elementId)}
          />
        ))}
      </ul>
      <p className="fpl-elite-cluster-card__section">Bench</p>
      <ul className="fpl-elite-cluster-card__elements">
        {bench.map((row) => (
          <PlayerChipRow
            key={row.elementId}
            row={row}
            hot={highlightElementId === row.elementId}
            playersById={playersById}
            teamsById={teamsById}
            onSelect={() => onSelectElement(row.elementId)}
          />
        ))}
      </ul>
    </article>
  )
}

function PlayerChipRow({
  row,
  hot,
  playersById,
  teamsById,
  onSelect,
}: {
  row: EliteClusterElementShare
  hot: boolean
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  onSelect: () => void
}) {
  const player = playersById.get(row.elementId)
  const team = player ? teamsById.get(player.teamId) : undefined
  const tint = teamTintColor(team)
  const style: CSSProperties | undefined = tint
    ? { ['--fpl-team' as string]: tint, ['--chip-tint' as string]: tint }
    : undefined

  return (
    <li>
      <button
        type="button"
        className={hot ? 'fpl-elite-cluster-card__chip is-hot' : 'fpl-elite-cluster-card__chip'}
        style={style}
        onClick={onSelect}
      >
        <span className="fpl-elite-cluster-card__chip-main">
          <PlayerPhoto code={player?.code ?? 0} name={player?.webName ?? `#${row.elementId}`} size={28} />
          <TeamCrest code={team?.code ?? 0} name={team?.shortName ?? '?'} size={16} />
          <span className="fpl-elite-cluster-card__chip-name">
            {player?.webName ?? `#${row.elementId}`}
            <small>
              {player?.position ?? '?'}
              {team ? ` · ${team.shortName}` : ''}
            </small>
          </span>
        </span>
        <em>{Math.round(row.ownership * 100)}%</em>
      </button>
    </li>
  )
}

function ClusterDetail({
  cluster,
  title,
  entryById,
  playersById,
  teamsById,
  onSelectElement,
  selectedElementId,
  onSelectEntry,
}: {
  cluster: EliteGwCluster
  title: string
  entryById: Map<number, EliteEntryRecord>
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  onSelectElement: (id: number) => void
  selectedElementId: number | null
  onSelectEntry: (entryId: number) => void
}) {
  const members = cluster.memberEntryIds
    .map((id) => entryById.get(id))
    .filter((row): row is EliteEntryRecord => row != null)
    .sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div className="fpl-elite-cluster-detail">
      <h3 className="fpl-explorer__title">
        <span className="fpl-elite-cluster-pill" style={{ ['--cluster-color' as string]: eliteClusterColor(cluster.id) }}>
          {title}
        </span>{' '}
        · {cluster.size} teams
      </h3>
      <p className="fpl-explorer__meta">
        Ownership below is the share of this cluster&apos;s members who own the player (medoid XI +
        bench).
      </p>
      <div className="fpl-elite-cluster-detail__cols">
        <div>
          <h4 className="fpl-elite-cluster-detail__sub">Medoid squad (15)</h4>
          <ul className="fpl-elite-cluster-detail__list">
            {cluster.squadElements.map((row) => {
              const player = playersById.get(row.elementId)
              const team = player ? teamsById.get(player.teamId) : undefined
              return (
                <li key={row.elementId}>
                  <button
                    type="button"
                    className={
                      selectedElementId === row.elementId
                        ? 'fpl-gw0-route-link is-active'
                        : 'fpl-gw0-route-link'
                    }
                    onClick={() => onSelectElement(row.elementId)}
                  >
                    <span className="fpl-elite-cluster-detail__player">
                      <PlayerPhoto
                        code={player?.code ?? 0}
                        name={player?.webName ?? `#${row.elementId}`}
                        size={24}
                      />
                      <TeamCrest code={team?.code ?? 0} name={team?.shortName ?? '?'} size={14} />
                      {player?.webName ?? `#${row.elementId}`}
                      <small>
                        {row.onXi ? 'XI' : 'BN'}
                        {player ? ` · ${player.position}` : ''}
                      </small>
                    </span>
                  </button>
                  <span>
                    {row.count}/{cluster.size} ({Math.round(row.ownership * 100)}%)
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <h4 className="fpl-elite-cluster-detail__sub">Members</h4>
          <ul className="fpl-elite-cluster-detail__list fpl-elite-cluster-detail__list--scroll">
            {members.map((entry) => (
              <li key={entry.entryId}>
                <button type="button" className="fpl-gw0-route-link" onClick={() => onSelectEntry(entry.entryId)}>
                  {entry.entryName}
                  {entry.entryId === cluster.medoidEntryId ? ' ★' : ''}
                </button>
                <span>
                  {entry.totalPoints} pts · {entry.entryId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ElementAcrossClusters({
  elementId,
  label,
  clustering,
  titleFor,
  onSelectCluster,
}: {
  elementId: number
  label: string
  clustering: EliteGwClustering
  titleFor: (cluster: EliteGwCluster) => string
  onSelectCluster: (id: number) => void
}) {
  const rows = clustering.clusters
    .map((cluster) => {
      const share =
        cluster.squadElements.find((row) => row.elementId === elementId) ??
        cluster.topElements.find((row) => row.elementId === elementId)
      return {
        cluster,
        ownership: share?.ownership ?? 0,
        count: share?.count ?? 0,
      }
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.ownership - a.ownership)

  return (
    <div className="fpl-elite-cluster-detail">
      <h3 className="fpl-explorer__title">{label} across clusters</h3>
      {rows.length === 0 ? (
        <p className="fpl-explorer__meta">No ownership in any cluster for this GW.</p>
      ) : (
        <ul className="fpl-elite-cluster-detail__list">
          {rows.map((row) => (
            <li key={row.cluster.id}>
              <button type="button" className="fpl-gw0-route-link" onClick={() => onSelectCluster(row.cluster.id)}>
                <span
                  className="fpl-elite-cluster-pill fpl-elite-cluster-pill--sm"
                  style={{ ['--cluster-color' as string]: eliteClusterColor(row.cluster.id) }}
                >
                  {titleFor(row.cluster)}
                </span>
              </button>
              <span>
                {row.count}/{row.cluster.size} ({Math.round(row.ownership * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TransitionDiagram({
  from,
  to,
  transitions,
  selectedClusterId,
  hoverFlow,
  titleFor,
  onHoverFlow,
  onSelectFrom,
  onSelectTo,
}: {
  from: EliteGwClustering
  to: EliteGwClustering
  transitions: EliteClusterTransition[]
  selectedClusterId: number | null
  hoverFlow: string | null
  titleFor: (cluster: EliteGwCluster) => string
  onHoverFlow: (key: string | null) => void
  onSelectFrom: (id: number) => void
  onSelectTo: (id: number) => void
}) {
  const width = 760
  const height = Math.max(240, Math.max(from.clusters.length, to.clusters.length) * 64 + 56)
  const leftX = 16
  const rightX = width - 16
  const nodeW = 148
  const nodeH = 42

  function yFor(index: number, total: number): number {
    if (total <= 1) return height / 2 - nodeH / 2
    const pad = 36
    const span = height - pad * 2 - nodeH
    return pad + (index / (total - 1)) * span
  }

  const leftNodes = from.clusters.map((cluster, index) => ({
    cluster,
    x: leftX,
    y: yFor(index, from.clusters.length),
    color: eliteClusterColor(cluster.id),
  }))
  const rightNodes = to.clusters.map((cluster, index) => ({
    cluster,
    x: rightX - nodeW,
    y: yFor(index, to.clusters.length),
    color: eliteClusterColor(cluster.id),
  }))

  const leftById = new Map(leftNodes.map((node) => [node.cluster.id, node]))
  const rightById = new Map(rightNodes.map((node) => [node.cluster.id, node]))
  const maxFlow = Math.max(1, ...transitions.map((row) => row.count))
  const hover = hoverFlow
    ? transitions.find((row) => `${row.fromClusterId}->${row.toClusterId}` === hoverFlow)
    : null

  return (
    <figure className="fpl-elite-flow" id="elite-transitions">
      <figcaption>
        Transition diagram · GW{from.gw} → GW{to.gw}
        {hover ? (
          <span>
            {' '}
            · {titleFor(from.clusters.find((c) => c.id === hover.fromClusterId) ?? from.clusters[0]!)} →{' '}
            {titleFor(to.clusters.find((c) => c.id === hover.toClusterId) ?? to.clusters[0]!)}: {hover.count}{' '}
            teams
          </span>
        ) : (
          <span> · hover a ribbon · click a node to focus that cluster</span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="fpl-elite-flow__svg" role="img">
        {transitions.map((flow) => {
          const a = leftById.get(flow.fromClusterId)
          const b = rightById.get(flow.toClusterId)
          if (!a || !b) return null
          const key = `${flow.fromClusterId}->${flow.toClusterId}`
          const x1 = a.x + nodeW
          const y1 = a.y + nodeH / 2
          const x2 = b.x
          const y2 = b.y + nodeH / 2
          const mid = (x1 + x2) / 2
          const strokeW = 2 + (flow.count / maxFlow) * 16
          const dim =
            selectedClusterId != null &&
            selectedClusterId !== flow.fromClusterId &&
            selectedClusterId !== flow.toClusterId
          const active =
            hoverFlow === key ||
            selectedClusterId === flow.fromClusterId ||
            selectedClusterId === flow.toClusterId
          return (
            <path
              key={key}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeW}
              strokeOpacity={dim ? 0.1 : active ? 0.9 : 0.38}
              className="fpl-elite-flow__ribbon"
              onMouseEnter={() => onHoverFlow(key)}
              onMouseLeave={() => onHoverFlow(null)}
            />
          )
        })}

        {leftNodes.map((node) => (
          <g
            key={`L${node.cluster.id}`}
            className="fpl-elite-flow__node"
            onClick={() => onSelectFrom(node.cluster.id)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={nodeW}
              height={nodeH}
              rx={6}
              fill={node.color}
              opacity={selectedClusterId == null || selectedClusterId === node.cluster.id ? 1 : 0.35}
            />
            <text
              x={node.x + nodeW / 2}
              y={node.y + 17}
              textAnchor="middle"
              fill="#fff"
              fontSize={11}
              fontWeight={700}
            >
              {shortTitle(titleFor(node.cluster))}
            </text>
            <text x={node.x + nodeW / 2} y={node.y + 32} textAnchor="middle" fill="#fff" fontSize={10}>
              {node.cluster.size} teams
            </text>
          </g>
        ))}

        {rightNodes.map((node) => (
          <g
            key={`R${node.cluster.id}`}
            className="fpl-elite-flow__node"
            onClick={() => onSelectTo(node.cluster.id)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={nodeW}
              height={nodeH}
              rx={6}
              fill={node.color}
              opacity={selectedClusterId == null || selectedClusterId === node.cluster.id ? 0.95 : 0.35}
            />
            <text
              x={node.x + nodeW / 2}
              y={node.y + 17}
              textAnchor="middle"
              fill="#fff"
              fontSize={11}
              fontWeight={700}
            >
              {shortTitle(titleFor(node.cluster))}
            </text>
            <text x={node.x + nodeW / 2} y={node.y + 32} textAnchor="middle" fill="#fff" fontSize={10}>
              {node.cluster.size} teams
            </text>
          </g>
        ))}

        <text x={leftX + nodeW / 2} y={18} textAnchor="middle" className="fpl-elite-flow__axis" fontSize={12}>
          GW{from.gw}
        </text>
        <text
          x={rightX - nodeW / 2}
          y={18}
          textAnchor="middle"
          className="fpl-elite-flow__axis"
          fontSize={12}
        >
          GW{to.gw}
        </text>
      </svg>
    </figure>
  )
}

function shortTitle(title: string): string {
  if (title.length <= 18) return title
  return `${title.slice(0, 16)}…`
}

export function EliteEntryPitch({
  entry,
  playersById,
  teamsById,
  clustering,
  initialGw,
  enrichment,
}: {
  entry: EliteEntryRecord
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
  clustering: EliteClusteringResult
  initialGw?: number | null
  enrichment?: ElitePitchEnrichment | null
}) {
  const gws = entry.gameweeks.map((row) => row.gw).sort((a, b) => a - b)
  const [gw, setGw] = useState(() => {
    if (initialGw != null && gws.includes(initialGw)) return initialGw
    return gws[0] ?? 1
  })

  const squad = entry.gameweeks.find((row) => row.gw === gw) ?? null
  const clusterId = clustering.byGw.find((row) => row.gw === gw)?.assignment[entry.entryId]
  const cluster =
    clusterId == null
      ? null
      : clustering.byGw.find((row) => row.gw === gw)?.clusters.find((row) => row.id === clusterId) ?? null

  const { formation, xi, bench } = useMemo(() => {
    if (!squad) return { formation: '3-4-3', xi: [] as PitchPlayer[], bench: [] as PitchPlayer[] }
    return squadToPitch(squad, playersById, teamsById, enrichment ?? null)
  }, [squad, playersById, teamsById, enrichment])

  const easiest = useMemo(() => {
    const rows = [...xi, ...bench]
      .map((player) => ({
        name: player.name,
        meanFdr: meanUpcomingFdr(player.fdrChips ?? []),
        chips: player.fdrChips ?? [],
      }))
      .filter((row) => row.meanFdr != null)
      .sort((a, b) => (a.meanFdr ?? 99) - (b.meanFdr ?? 99) || a.name.localeCompare(b.name))
    return rows.slice(0, 8)
  }, [xi, bench])

  const gwIndex = gws.indexOf(gw)
  const color = clusterId != null ? eliteClusterColor(clusterId) : undefined

  return (
    <section className="fpl-perfect-summary fpl-elite-entry-pitch">
      <div className="fpl-elite-entry-pitch__head">
        <h2 className="fpl-explorer__title">
          {entry.entryName}{' '}
          <span className="fpl-explorer__meta">({entry.entryId})</span>
        </h2>
        {cluster ? (
          <span className="fpl-elite-cluster-pill" style={{ ['--cluster-color' as string]: color }}>
            GW{gw} · {cluster.signatureElementIds.map((id) => playersById.get(id)?.webName ?? `#${id}`).slice(0, 3).join(' · ')}
          </span>
        ) : (
          <span className="fpl-explorer__meta">GW{gw} · unclustered</span>
        )}
      </div>

      {squad ? (
        <>
          <p className="fpl-explorer__meta">
            Cards show price, form, recent GW points (latest as the badge), and upcoming FDR chips (green easy → red
            hard). Expand the pitch for the full breakdown.
          </p>
          <div className="fpl-perfect-pitch-nav">
            <button
              type="button"
              className="fpl-perfect-pitch-nav__btn"
              aria-label="Previous gameweek"
              disabled={gwIndex <= 0}
              onClick={() => setGw(gws[gwIndex - 1]!)}
            >
              ←
            </button>
            <div className="fpl-perfect-pitch-nav__pitch">
              <FplPitch
                formation={formation}
                players={xi}
                bench={bench}
                label={`GW${gw} · ${formation}`}
                weekChip={squad.activeChip}
                showCost
                showDetails
                compact
                expandable
              />
            </div>
            <button
              type="button"
              className="fpl-perfect-pitch-nav__btn"
              aria-label="Next gameweek"
              disabled={gwIndex < 0 || gwIndex >= gws.length - 1}
              onClick={() => setGw(gws[gwIndex + 1]!)}
            >
              →
            </button>
          </div>
          {easiest.length > 0 ? (
            <div className="fpl-elite-entry-pitch__runs">
              <h3 className="fpl-elite-cluster-detail__sub">Easiest upcoming runs on this squad</h3>
              <ul className="fpl-elite-cluster-detail__list">
                {easiest.map((row) => (
                  <li key={row.name}>
                    <span>{row.name}</span>
                    <span>
                      avg FDR {row.meanFdr!.toFixed(1)} ·{' '}
                      {row.chips.map((chip) => `${chip.label}${chip.fdr}`).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="fpl-explorer__meta">No squad stored for GW{gw}.</p>
      )}
    </section>
  )
}

function squadToPitch(
  squad: EliteGameweekSquad,
  playersById: Map<number, FplPlayer>,
  teamsById: Map<number, FplTeam>,
  enrichment: ElitePitchEnrichment | null,
): { formation: string; xi: PitchPlayer[]; bench: PitchPlayer[] } {
  const counts = { DEF: 0, MID: 0, FWD: 0 }
  const ctx = enrichment

  function toCard(elementId: number, onBench: boolean): PitchPlayer {
    const player = playersById.get(elementId)
    const team = player ? teamsById.get(player.teamId) : undefined
    const position = player?.position ?? 'MID'
    const base: PitchPlayer = {
      id: elementId,
      name: player?.webName ?? `#${elementId}`,
      photoCode: player?.code,
      teamCode: team?.code,
      teamShortName: team?.shortName,
      position,
      captain: elementId === squad.captainElementId,
      viceCaptain: elementId === squad.viceCaptainElementId,
      points: null,
      pointsUnscored: onBench,
    }
    return ctx ? enrichElitePitchPlayer(base, elementId, ctx) : base
  }

  const xi: PitchPlayer[] = []
  for (const elementId of squad.xi) {
    const player = playersById.get(elementId)
    const position = player?.position ?? 'MID'
    const line = pitchLineOf(position)
    if (line === 'DEF' || line === 'MID' || line === 'FWD') counts[line] += 1
    xi.push(toCard(elementId, false))
  }

  const bench: PitchPlayer[] = squad.bench.map((elementId) => toCard(elementId, true))

  const outfield = counts.DEF + counts.MID + counts.FWD
  const formationLabel =
    outfield === 10 ? `${counts.DEF}-${counts.MID}-${counts.FWD}` : '3-4-3'

  return { formation: formationLabel, xi, bench }
}

export function ClusterBadge({
  clusterId,
  label,
}: {
  clusterId: number | null | undefined
  label?: string
}) {
  if (clusterId == null) return <span className="fpl-explorer__meta">—</span>
  return (
    <span
      className="fpl-elite-cluster-pill fpl-elite-cluster-pill--sm"
      style={{ ['--cluster-color' as string]: eliteClusterColor(clusterId) }}
      title={label}
    >
      {label ?? `T${clusterId}`}
    </span>
  )
}
