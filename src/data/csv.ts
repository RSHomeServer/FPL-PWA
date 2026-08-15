/** Minimal RFC4180 CSV parser for vaastav published files. */

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''))
  if (rows.length === 0) return []
  const headers = rows[0].map((header) => header.trim())
  const records: Record<string, string>[] = []
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim() === '')) continue
    const record: Record<string, string> = {}
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i]
      if (!key) continue
      record[key] = row[i] ?? ''
    }
    records.push(record)
  }
  return records
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      if (cell.endsWith('\r')) cell = cell.slice(0, -1)
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += char
  }

  if (cell.length > 0 || row.length > 0) {
    if (cell.endsWith('\r')) cell = cell.slice(0, -1)
    row.push(cell)
    rows.push(row)
  }

  return rows
}

export function parseIntField(value: string | undefined, fallback = 0): number {
  if (value == null || value === '' || value === 'None' || value === 'null') {
    return fallback
  }
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export function parseFloatField(value: string | undefined, fallback = 0): number {
  if (value == null || value === '' || value === 'None' || value === 'null') {
    return fallback
  }
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

export function parseOptionalInt(value: string | undefined): number | null {
  if (value == null || value === '' || value === 'None' || value === 'null') {
    return null
  }
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function parseBoolField(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}
