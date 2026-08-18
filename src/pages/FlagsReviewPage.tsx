import { Button, Label, Select, Stack, TextArea, TextField } from '@songara/pwa-base/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import seedFile from '../analysis/gw0RoleEvidence.seed.json'
import { mSemFromRoleEvidence, parseRoleEvidenceRecord, parseRoleEvidenceSeed } from '../analysis/roleEvidence'
import { readStoredRoleEvidence, upsertRoleEvidence } from '../data/roleEvidenceStore'
import type {
  CompetitionForPlace,
  EvidenceConfidence,
  FitnessConcern,
  RoleChange,
  RoleContinuity,
  RoleEvidenceRecord,
  StartingLikelihood,
} from '../data/types'
import { DataTable, ExplorerEmpty, ExplorerScreen } from './ExplorerScreen'

const STARTS: StartingLikelihood[] = ['HIGH', 'MEDIUM', 'LOW']
const CONTINUITY: RoleContinuity[] = ['HIGH', 'MEDIUM', 'LOW']
const COMPETITION: CompetitionForPlace[] = ['HIGH', 'MEDIUM', 'LOW']
const FITNESS: FitnessConcern[] = ['NONE', 'MEDIUM', 'HIGH']
const CHANGE: RoleChange[] = ['NONE', 'MINOR', 'MAJOR']
const CONF: EvidenceConfidence[] = ['HIGH', 'MEDIUM', 'LOW']

export function FlagsReviewPage() {
  const seed = useMemo(() => parseRoleEvidenceSeed(seedFile), [])
  const [stored, setStored] = useState<RoleEvidenceRecord[]>([])
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState<number | null>(seed[0]?.code ?? null)
  const [pending, setPending] = useState<RoleEvidenceRecord | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)

  const merged = useMemo(() => {
    const byCode = new Map<number, RoleEvidenceRecord>()
    for (const row of seed) byCode.set(row.code, row)
    for (const row of stored) byCode.set(row.code, row)
    return [...byCode.values()].sort((a, b) => a.webName.localeCompare(b.webName))
  }, [seed, stored])

  useEffect(() => {
    void (async () => {
      try {
        const rows = await readStoredRoleEvidence()
        setStored(rows)
        setStatus('ready')
      } catch (cause) {
        setStatus('error')
        setMessage(cause instanceof Error ? cause.message : 'Dexie RoleEvidence store failed to open')
      }
    })()
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return merged
    return merged.filter((row) => `${row.webName} ${row.code}`.toLowerCase().includes(needle))
  }, [merged, query])

  const selected = visible.find((row) => row.code === selectedCode) ?? visible[0] ?? null
  const draft = pending && selected && pending.code === selected.code ? pending : selected

  function selectRow(code: number) {
    setSelectedCode(code)
    setPending(null)
  }

  const save = useCallback(async () => {
    if (!draft) return
    const parsed = parseRoleEvidenceRecord({ ...draft, updatedAt: Date.now() })
    if (!parsed) {
      setMessage('Could not save: enums or code missing.')
      return
    }
    setStatus('saving')
    try {
      await upsertRoleEvidence(parsed)
      const rows = await readStoredRoleEvidence()
      setStored(rows)
      setPending(null)
      setStatus('ready')
      setMessage(`Saved ${parsed.webName} (m_sem=${mSemFromRoleEvidence(parsed).toFixed(2)})`)
    } catch (cause) {
      setStatus('error')
      setMessage(cause instanceof Error ? cause.message : 'Save failed')
    }
  }, [draft])

  return (
    <ExplorerScreen
      hideSeasonBar
      kicker="GW0 flags"
      title="Role evidence review"
      question="Inspect and edit startingLikelihood / roleChange enums for the auto-flagged set. Unreviewed players keep m_sem = 1. This is not a squad picker."
    >
      <div className="fpl-explorer__toolbar">
        <Label className="fpl-explorer__field">
          Filter
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or code"
          />
        </Label>
        <p className="fpl-explorer__meta">
          Seed {seed.length} · Dexie overlays {stored.length} · showing {visible.length}
          {message ? ` · ${message}` : ''}
        </p>
      </div>

      {status !== 'loading' && visible.length === 0 ? (
        <ExplorerEmpty
          title="No seeded flags yet"
          description="Run npm run gw0:phase2 and commit src/analysis/gw0RoleEvidence.seed.json, then refresh."
        />
      ) : null}

      <DataTable
        caption="Auto-flagged review set (seed + local edits)"
        defaultSort={{ id: 'player', direction: 'asc' }}
        columns={[
          {
            id: 'player',
            label: 'Player',
            sortValue: (row) => row.webName,
            render: (row) => (
              <button type="button" className="fpl-explorer__row-link" onClick={() => selectRow(row.code)}>
                {row.webName}
              </button>
            ),
          },
          { id: 'code', label: 'Code', sortValue: (row) => row.code, render: (row) => row.code },
          {
            id: 'start',
            label: 'Start',
            sortValue: (row) => row.startingLikelihood,
            render: (row) => row.startingLikelihood,
          },
          { id: 'change', label: 'Change', sortValue: (row) => row.roleChange, render: (row) => row.roleChange },
          {
            id: 'msem',
            label: 'm_sem',
            sortValue: (row) => mSemFromRoleEvidence(row),
            render: (row) => mSemFromRoleEvidence(row).toFixed(2),
          },
          { id: 'conf', label: 'Conf', sortValue: (row) => row.confidence, render: (row) => row.confidence },
        ]}
        rows={visible}
        empty="No matching seed rows."
        rowKey={(row) => row.code}
      />

      {draft ? (
        <form
          className="fpl-flags-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <h2 className="fpl-explorer__title">{draft.webName}</h2>
          <p className="fpl-explorer__meta">
            code {draft.code}
            {draft.liveId ? ` · live id ${draft.liveId}` : ''} · m_sem={mSemFromRoleEvidence(draft).toFixed(2)}
          </p>
          <div className="fpl-flags-form__grid">
            <EnumField
              label="startingLikelihood"
              value={draft.startingLikelihood}
              options={STARTS}
              onChange={(startingLikelihood) => setPending({ ...draft, startingLikelihood })}
            />
            <EnumField
              label="roleChange"
              value={draft.roleChange}
              options={CHANGE}
              onChange={(roleChange) => setPending({ ...draft, roleChange })}
            />
            <EnumField
              label="roleContinuity"
              value={draft.roleContinuity}
              options={CONTINUITY}
              onChange={(roleContinuity) => setPending({ ...draft, roleContinuity })}
            />
            <EnumField
              label="competitionForPlace"
              value={draft.competitionForPlace}
              options={COMPETITION}
              onChange={(competitionForPlace) => setPending({ ...draft, competitionForPlace })}
            />
            <EnumField
              label="fitnessConcern"
              value={draft.fitnessConcern}
              options={FITNESS}
              onChange={(fitnessConcern) => setPending({ ...draft, fitnessConcern })}
            />
            <EnumField
              label="confidence"
              value={draft.confidence}
              options={CONF}
              onChange={(confidence) => setPending({ ...draft, confidence })}
            />
          </div>
          <Label className="fpl-explorer__field">
            evidenceNotes
            <TextArea
              rows={4}
              value={draft.evidenceNotes}
              onChange={(event) => setPending({ ...draft, evidenceNotes: event.target.value })}
            />
          </Label>
          <Label className="fpl-explorer__field">
            sources (one URL per line)
            <TextArea
              rows={3}
              value={draft.sources.join('\n')}
              onChange={(event) =>
                setPending({
                  ...draft,
                  sources: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </Label>
          <Stack direction="row" gap="sm">
            <Button type="submit" variant="primary" disabled={status === 'saving'}>
              Save to this browser
            </Button>
          </Stack>
        </form>
      ) : null}
    </ExplorerScreen>
  )
}

function EnumField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <Label className="fpl-explorer__field">
      {label}
      <Select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </Label>
  )
}
