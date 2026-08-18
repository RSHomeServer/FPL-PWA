import { useState } from 'react'
import { nameInitials, playerPhotoUrl, teamCrestUrl, teamShirtUrl } from '../data/media'
import { playerDisplayName } from '../data/parse'
import type { FplPlayer, FplTeam } from '../data/types'

export function PlayerPhoto({
  code,
  name,
  size = 32,
}: {
  code: number
  name: string
  size?: number
}) {
  const src = playerPhotoUrl(code)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className="fpl-media fpl-media--fallback" style={{ width: size, height: size }} aria-hidden>
        {nameInitials(name)}
      </span>
    )
  }

  return (
    <img
      className="fpl-media"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function TeamCrest({
  code,
  name,
  size = 20,
}: {
  code: number
  name: string
  size?: number
}) {
  const src = teamCrestUrl(code)
  const [failed, setFailed] = useState(false)
  const fallback = name.trim().slice(0, 3).toUpperCase() || '?'

  if (!src || failed) {
    return (
      <span className="fpl-media fpl-media--crest-fallback" style={{ minWidth: size }} aria-hidden>
        {fallback}
      </span>
    )
  }

  return (
    <img
      className="fpl-media fpl-media--crest"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function ShirtImage({
  teamCode,
  name,
  keeper = false,
  size = 56,
  className,
}: {
  teamCode: number
  name: string
  keeper?: boolean
  size?: number
  className?: string
}) {
  const src = teamShirtUrl(teamCode, keeper)
  const [failed, setFailed] = useState(false)
  const height = Math.round(size * 1.2)

  if (!src || failed) {
    return (
      <span
        className={['fpl-media', 'fpl-media--shirt-fallback', className].filter(Boolean).join(' ')}
        style={{ width: size, height }}
        aria-hidden
      >
        {nameInitials(name)}
      </span>
    )
  }

  return (
    <img
      className={['fpl-media', 'fpl-media--shirt', className].filter(Boolean).join(' ')}
      src={src}
      alt=""
      width={size}
      height={height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function PlayerLabel({
  player,
  name,
  size = 32,
}: {
  player?: Pick<FplPlayer, 'code' | 'webName' | 'firstName' | 'secondName'>
  name?: string
  size?: number
}) {
  const label = player ? playerDisplayName(player) : (name ?? 'Player')
  return (
    <span className="fpl-media-row">
      <PlayerPhoto code={player?.code ?? 0} name={label} size={size} />
      <span>{label}</span>
    </span>
  )
}

export function TeamLabel({
  team,
  name,
  size = 20,
}: {
  team?: Pick<FplTeam, 'code' | 'name' | 'shortName'>
  name?: string
  size?: number
}) {
  const label = team?.shortName || team?.name || name || '—'
  return (
    <span className="fpl-media-row">
      <TeamCrest code={team?.code ?? 0} name={label} size={size} />
      <span>{label}</span>
    </span>
  )
}
