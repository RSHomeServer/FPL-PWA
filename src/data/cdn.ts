const VAASTAV_CDN =
  'https://cdn.jsdelivr.net/gh/vaastav/Fantasy-Premier-League@master'
const GITHUB_TIP =
  'https://api.github.com/repos/vaastav/Fantasy-Premier-League/commits/master'

export type CdnFile = {
  path: string
  ok: boolean
  status: number
  text: string
  etag: string
}

export function vaastavCdnUrl(path: string): string {
  const trimmed = path.replace(/^\/+/, '')
  return `${VAASTAV_CDN}/${trimmed}`
}

export async function fetchVaastavFile(path: string): Promise<CdnFile> {
  const response = await fetch(vaastavCdnUrl(path), {
    headers: { Accept: 'text/csv,text/plain,*/*' },
  })
  const text = response.ok ? await response.text() : ''
  return {
    path,
    ok: response.ok,
    status: response.status,
    text,
    etag: response.headers.get('etag') ?? '',
  }
}

export async function fetchVaastavFiles(paths: readonly string[]): Promise<CdnFile[]> {
  return Promise.all(paths.map((path) => fetchVaastavFile(path)))
}

/** jsDelivr `@master` often reports branch name only; GitHub tip SHA is the revision. */
export async function fetchVaastavRevision(): Promise<string> {
  try {
    const response = await fetch(GITHUB_TIP, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
    if (!response.ok) return `master@${Date.now()}`
    const body = (await response.json()) as { sha?: string }
    return body.sha?.slice(0, 12) || `master@${Date.now()}`
  } catch {
    return `master@${Date.now()}`
  }
}

export function seasonFolderIds(now = new Date()): string[] {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const latestStart = month >= 7 ? year : year - 1
  const ids: string[] = []
  for (let start = 2016; start <= latestStart; start += 1) {
    const end = String(start + 1).slice(-2)
    ids.push(`${start}-${end}`)
  }
  return ids
}

export async function discoverPublishedSeasons(
  probe: (seasonId: string) => Promise<boolean> = seasonHasPlayersFile,
): Promise<string[]> {
  const ids = seasonFolderIds()
  const flags = await Promise.all(ids.map((id) => probe(id)))
  return ids.filter((_, index) => flags[index])
}

async function seasonHasPlayersFile(seasonId: string): Promise<boolean> {
  const file = await fetchVaastavFile(`data/${seasonId}/players_raw.csv`)
  return file.ok && file.text.includes(',')
}
