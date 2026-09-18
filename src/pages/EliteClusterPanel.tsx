import { useMemo, useState } from 'react'
import {
  clusterEliteEntries,
  type EliteClusterTransition,
  type EliteGwCluster,
  type EliteGwClustering,
} from '../analysis/eliteCluster'
import type { EliteEntryRecord, FplPlayer, FplTeam } from '../data/types'

const CLUSTER_COLORS = [
  '#0d9488',
  '#d97706',
  '#2563eb',
  '#dc2626',
  '#65a30d',
  '#0891b2',
  '#c2410c',
  '#4f46e5',
]

type EliteClusterPanelProps = {
  entries: EliteEntryRecord[]
  playersById: Map<number, FplPlayer>
  teamsById: Map<number, FplTeam>
}

export function EliteClusterPanel({ entries, playersById, teamsById }: EliteClusterPanelProps) {
  const clustering = useMemo(() => clusterEliteEntries(entries, { k: 6, minMembers: 8 }), [entries])
  const gameweeks = clustering.byGw.map((row) => row.gw)
  const [selectedGw, setSelectedGw] = useState<number | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null)
  const [hoverFlow, setHoverFlow] = useState<string | null>(null)

  const activeGw = selectedGw ?? gameweeks[0] ?? null
  const gwClustering = clustering.byGw.find((row) => row.gw === activeGw) ?? null
  const nextClustering =
    gwClustering != null
      ? clustering.byGw.find((row) => row.gw > gwClustering.gw) ?? null
      : null
  const transitions = useMemo(() => {
    if (!gwClustering || !nextClustering) return []
    return clustering.transitions.filter(
      (row) => row.fromGw === gwClustering.gw && row.toGw === nextClustering.gw,
    )
  }, [clustering.transitions, gwClustering, nextClustering])

  const entryById = useMemo(() => {
    const map = new Map<number, EliteEntryRecord>()
    for (const entry of entries) map.set(entry.entryId, entry)
    return map
  }, [entries])

  function elementLabel(elementId: number): string {
    const player = playersById.get(elementId)
    if (!player) return `#${elementId}`
    const team = teamsById.get(player.teamId)
    return team ? `${player.webName} (${team.shortName})` : player.webName
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
          Jaccard k-medoids on 15-man sets (k≈6). Click a cluster for members and ownership, an element
          chip to highlight who owns it, or a transition ribbon for flow between weeks.
        </p>
      </div>

      <div className="fpl-elite-clusters__gw-tabs" role="tablist" aria-label="Gameweek">
        {gameweeks.map((gw) => (
          <button
            key={gw}
            type="button"
            role="tab"
            aria-selected={gw === activeGw}
            className={
              gw === activeGw ? 'fpl-elite-clusters__gw-tab is-active' : 'fpl-elite-clusters__gw-tab'
            }
            onClick={() => {
              setSelectedGw(gw)
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
            {nextClustering ? (
              <span>
                Transitions → GW{nextClustering.gw}
              </span>
            ) : (
              <span>Latest clustered week</span>
            )}
          </div>

          <div className="fpl-elite-clusters__grid">
            {gwClustering.clusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                color={CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length]!}
                selected={selectedClusterId === cluster.id}
                highlightElementId={selectedElementId}
                elementLabel={elementLabel}
                medoidName={entryById.get(cluster.medoidEntryId)?.entryName ?? String(cluster.medoidEntryId)}
                onSelect={() => selectCluster(cluster.id)}
                onSelectElement={selectElement}
              />
            ))}
          </div>

          {nextClustering && transitions.length > 0 ? (
            <TransitionDiagram
              from={gwClustering}
              to={nextClustering}
              transitions={transitions}
              selectedClusterId={selectedClusterId}
              hoverFlow={hoverFlow}
              onHoverFlow={setHoverFlow}
              onSelectFrom={(id) => {
                setSelectedClusterId(id)
                setSelectedElementId(null)
              }}
            />
          ) : null}

          {selectedCluster ? (
            <ClusterDetail
              cluster={selectedCluster}
              entryById={entryById}
              elementLabel={elementLabel}
              onSelectElement={selectElement}
              selectedElementId={selectedElementId}
            />
          ) : null}

          {selectedElementId != null && !selectedCluster ? (
            <ElementAcrossClusters
              elementId={selectedElementId}
              label={elementLabel(selectedElementId)}
              clustering={gwClustering}
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
  color,
  selected,
  highlightElementId,
  elementLabel,
  medoidName,
  onSelect,
  onSelectElement,
}: {
  cluster: EliteGwCluster
  color: string
  selected: boolean
  highlightElementId: number | null
  elementLabel: (id: number) => string
  medoidName: string
  onSelect: () => void
  onSelectElement: (id: number) => void
}) {
  const chips = Object.entries(cluster.chipCounts)
    .filter(([chip]) => chip !== 'none')
    .sort((a, b) => b[1] - a[1])

  return (
    <article
      className={selected ? 'fpl-elite-cluster-card is-selected' : 'fpl-elite-cluster-card'}
      style={{ ['--cluster-color' as string]: color }}
    >
      <button type="button" className="fpl-elite-cluster-card__select" onClick={onSelect}>
        <div className="fpl-elite-cluster-card__head">
          <span className="fpl-elite-cluster-card__swatch" aria-hidden />
          <strong>{cluster.label}</strong>
          <span className="fpl-elite-cluster-card__size">{cluster.size} teams</span>
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
      <ul className="fpl-elite-cluster-card__elements">
        {cluster.topElements.slice(0, 8).map((row) => {
          const hot = highlightElementId === row.elementId
          return (
            <li key={row.elementId}>
              <button
                type="button"
                className={
                  hot
                    ? 'fpl-elite-cluster-card__chip is-hot'
                    : 'fpl-elite-cluster-card__chip'
                }
                onClick={() => onSelectElement(row.elementId)}
              >
                {elementLabel(row.elementId)}
                <em>{Math.round(row.ownership * 100)}%</em>
              </button>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function ClusterDetail({
  cluster,
  entryById,
  elementLabel,
  onSelectElement,
  selectedElementId,
}: {
  cluster: EliteGwCluster
  entryById: Map<number, EliteEntryRecord>
  elementLabel: (id: number) => string
  onSelectElement: (id: number) => void
  selectedElementId: number | null
}) {
  const members = cluster.memberEntryIds
    .map((id) => entryById.get(id))
    .filter((row): row is EliteEntryRecord => row != null)
    .sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div className="fpl-elite-cluster-detail">
      <h3 className="fpl-explorer__title">
        {cluster.label} · {cluster.size} teams
      </h3>
      <div className="fpl-elite-cluster-detail__cols">
        <div>
          <h4 className="fpl-elite-cluster-detail__sub">Ownership</h4>
          <ul className="fpl-elite-cluster-detail__list">
            {cluster.topElements.map((row) => (
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
                  {elementLabel(row.elementId)}
                </button>
                <span>
                  {row.count}/{cluster.size} ({Math.round(row.ownership * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="fpl-elite-cluster-detail__sub">Members</h4>
          <ul className="fpl-elite-cluster-detail__list fpl-elite-cluster-detail__list--scroll">
            {members.map((entry) => (
              <li key={entry.entryId}>
                <span>
                  {entry.entryName}
                  {entry.entryId === cluster.medoidEntryId ? ' ★' : ''}
                </span>
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
  onSelectCluster,
}: {
  elementId: number
  label: string
  clustering: EliteGwClustering
  onSelectCluster: (id: number) => void
}) {
  const rows = clustering.clusters
    .map((cluster) => {
      const share = cluster.topElements.find((row) => row.elementId === elementId)
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
        <p className="fpl-explorer__meta">Not in any cluster top-12 for this GW (still may appear deeper).</p>
      ) : (
        <ul className="fpl-elite-cluster-detail__list">
          {rows.map((row) => (
            <li key={row.cluster.id}>
              <button type="button" className="fpl-gw0-route-link" onClick={() => onSelectCluster(row.cluster.id)}>
                {row.cluster.label}
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
  onHoverFlow,
  onSelectFrom,
}: {
  from: EliteGwClustering
  to: EliteGwClustering
  transitions: EliteClusterTransition[]
  selectedClusterId: number | null
  hoverFlow: string | null
  onHoverFlow: (key: string | null) => void
  onSelectFrom: (id: number) => void
}) {
  const width = 720
  const height = Math.max(220, Math.max(from.clusters.length, to.clusters.length) * 56 + 48)
  const leftX = 24
  const rightX = width - 24
  const nodeW = 108
  const nodeH = 36

  function yFor(index: number, total: number): number {
    if (total <= 1) return height / 2 - nodeH / 2
    const pad = 28
    const span = height - pad * 2 - nodeH
    return pad + (index / (total - 1)) * span
  }

  const leftNodes = from.clusters.map((cluster, index) => ({
    cluster,
    x: leftX,
    y: yFor(index, from.clusters.length),
    color: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length]!,
  }))
  const rightNodes = to.clusters.map((cluster, index) => ({
    cluster,
    x: rightX - nodeW,
    y: yFor(index, to.clusters.length),
    color: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length]!,
  }))

  const leftById = new Map(leftNodes.map((node) => [node.cluster.id, node]))
  const rightById = new Map(rightNodes.map((node) => [node.cluster.id, node]))
  const maxFlow = Math.max(1, ...transitions.map((row) => row.count))

  const hover = hoverFlow ? transitions.find((row) => `${row.fromClusterId}->${row.toClusterId}` === hoverFlow) : null

  return (
    <figure className="fpl-elite-flow">
      <figcaption>
        Cluster transitions GW{from.gw} → GW{to.gw}
        {hover ? (
          <span>
            {' '}
            · C{hover.fromClusterId + 1} → C{hover.toClusterId + 1}: {hover.count} teams
          </span>
        ) : null}
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
          const strokeW = 2 + (flow.count / maxFlow) * 14
          const dim =
            selectedClusterId != null &&
            selectedClusterId !== flow.fromClusterId &&
            selectedClusterId !== flow.toClusterId
          const active = hoverFlow === key || selectedClusterId === flow.fromClusterId
          return (
            <path
              key={key}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeW}
              strokeOpacity={dim ? 0.12 : active ? 0.85 : 0.35}
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
            <text x={node.x + nodeW / 2} y={node.y + 22} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
              {node.cluster.label} · {node.cluster.size}
            </text>
          </g>
        ))}

        {rightNodes.map((node) => (
          <g key={`R${node.cluster.id}`}>
            <rect
              x={node.x}
              y={node.y}
              width={nodeW}
              height={nodeH}
              rx={6}
              fill={node.color}
              opacity={0.85}
            />
            <text x={node.x + nodeW / 2} y={node.y + 22} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={700}>
              {node.cluster.label} · {node.cluster.size}
            </text>
          </g>
        ))}

        <text x={leftX + nodeW / 2} y={16} textAnchor="middle" className="fpl-elite-flow__axis" fontSize={11}>
          GW{from.gw}
        </text>
        <text x={rightX - nodeW / 2} y={16} textAnchor="middle" className="fpl-elite-flow__axis" fontSize={11}>
          GW{to.gw}
        </text>
      </svg>
    </figure>
  )
}
