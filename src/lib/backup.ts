import { format } from 'date-fns'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { defaultSettings, SCHEMA_VERSION } from './store'
import type {
  AppData,
  Backup,
  Debt,
  DebtDirection,
  DebtPayment,
  Job,
  PaymentMethod,
  Settings,
  Shift,
} from './types'

export function buildBackup(data: AppData): Backup {
  return {
    app: 'payday',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    jobs: data.jobs,
    shifts: data.shifts,
    debts: data.debts,
    settings: data.settings,
  }
}

export function backupFilename(now: Date = new Date()): string {
  return `payday-backup-${format(now, 'yyyy-MM-dd')}.json`
}

export type SaveResult = 'downloaded' | 'shared' | 'cancelled'

/**
 * Saves a backup off the device.
 *
 * The browser gets the ordinary blob download. That does NOT work inside the
 * Android WebView the packaged app runs in. An `<a download>` is simply ignored
 * there, so on native the file is written to app storage and handed to the
 * system share sheet, which is the only route a user can actually get it out to
 * Drive, email or Files.
 */
export async function saveBackup(data: AppData): Promise<SaveResult> {
  const json = JSON.stringify(buildBackup(data), null, 2)
  const filename = backupFilename()

  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({
        title: 'Payday backup',
        text: 'Payday backup',
        files: [written.uri],
        dialogTitle: 'Save your Payday backup',
      })
      return 'shared'
    } catch {
      // Dismissing the share sheet throws; that is a cancel, not a failure.
      return 'cancelled'
    }
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

/**
 * Everything below coerces one untrusted value into a known-good one.
 *
 * A backup is a file the user picked off their phone; nothing guarantees this app
 * wrote it, or wrote it correctly. The type assertions this replaces were a lie the
 * compiler believed. A shift whose `rate` arrived as a string put NaN through the
 * earnings maths, and since NaN propagates, one bad row turned every total on the
 * screen into "$NaN". Coercing on import means a malformed file loses its own bad
 * fields and nothing else.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const METHODS: PaymentMethod[] = ['cash', 'bank', 'other']
const DIRECTIONS: DebtDirection[] = ['owed_to_me', 'i_owe']

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isoDate(value: unknown): string | undefined {
  const text = str(value)
  return ISO_DATE.test(text) ? text : undefined
}

function clock(value: unknown, fallback: string): string {
  const text = str(value)
  return CLOCK.test(text) ? text : fallback
}

/** Money and hours must be finite and non-negative or the arithmetic downstream lies. */
function num(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function sanitiseJob(raw: unknown, index: number): Job | null {
  const o = record(raw)
  if (!o) return null
  const name = str(o.name).trim()
  if (name === '') return null
  return {
    id: str(o.id) || `imported-job-${String(index)}`,
    name,
    defaultRate: num(o.defaultRate, 0),
    archived: o.archived === true,
  }
}

function sanitiseShift(raw: unknown, index: number): Shift | null {
  const o = record(raw)
  if (!o) return null
  const date = isoDate(o.date)
  // Undated work cannot be placed in a period, totalled, or shown on the heatmap.
  if (!date) return null
  const paid = o.paid === true
  return {
    id: str(o.id) || `imported-shift-${String(index)}`,
    jobId: str(o.jobId),
    date,
    start: clock(o.start, '09:00'),
    end: clock(o.end, '17:00'),
    breakMinutes: num(o.breakMinutes, 0),
    rate: num(o.rate, 0),
    paid,
    // A paid date on an unpaid shift is contradictory; drop it rather than carry it.
    paidDate: paid ? isoDate(o.paidDate) : undefined,
    paymentMethod: METHODS.includes(o.paymentMethod as PaymentMethod)
      ? (o.paymentMethod as PaymentMethod)
      : undefined,
    note: optionalStr(o.note),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
  }
}

function sanitisePayment(raw: unknown, index: number): DebtPayment | null {
  const o = record(raw)
  if (!o) return null
  const date = isoDate(o.date)
  if (!date) return null
  return {
    id: str(o.id) || `imported-payment-${String(index)}`,
    date,
    amountCents: Math.round(num(o.amountCents, 0)),
    note: optionalStr(o.note),
  }
}

function sanitiseDebt(raw: unknown, index: number): Debt | null {
  const o = record(raw)
  if (!o) return null
  const person = str(o.person).trim()
  const date = isoDate(o.date)
  if (person === '' || !date) return null
  return {
    id: str(o.id) || `imported-debt-${String(index)}`,
    person,
    direction: DIRECTIONS.includes(o.direction as DebtDirection)
      ? (o.direction as DebtDirection)
      : 'owed_to_me',
    amountCents: Math.round(num(o.amountCents, 0)),
    date,
    note: optionalStr(o.note),
    payments: sanitiseAll(o.payments, sanitisePayment),
    settledAt: isoDate(o.settledAt),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
  }
}

function sanitiseSettings(raw: unknown): Settings {
  const o = record(raw)
  const fallback = defaultSettings()
  if (!o) return fallback
  return {
    currency: 'USD',
    weekStartsOn: o.weekStartsOn === 0 ? 0 : 1,
  }
}

/** Repeated ids would collide as React keys and make edits hit the wrong row. */
function withUniqueIds<T extends { id: string }>(rows: T[], prefix: string): T[] {
  const seen = new Set<string>()
  return rows.map((row, index) => {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      return row
    }
    return { ...row, id: `${prefix}-${String(index)}` }
  })
}

function sanitiseAll<T>(raw: unknown, each: (entry: unknown, index: number) => T | null): T[] {
  if (!Array.isArray(raw)) return []
  return raw.map(each).filter((entry): entry is T => entry !== null)
}

/**
 * Validates an uploaded backup before it is allowed to replace live data.
 * Import is destructive, so this errs on the side of rejecting anything it
 * cannot positively identify as a Payday backup.
 */
export function parseBackup(text: string): AppData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON.")
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error("That file doesn't look like a Payday backup.")
  }

  const obj = raw as Partial<Backup>
  if (obj.app !== 'payday') {
    throw new Error("That file doesn't look like a Payday backup.")
  }
  if (typeof obj.version !== 'number' || obj.version > SCHEMA_VERSION) {
    throw new Error(
      `That backup was made by a newer version of Payday (v${String(obj.version)}). Update the app first.`,
    )
  }
  if (!Array.isArray(obj.jobs) || !Array.isArray(obj.shifts)) {
    throw new Error('That backup is missing its jobs or shifts.')
  }

  return {
    jobs: withUniqueIds(sanitiseAll(obj.jobs, sanitiseJob), 'job'),
    shifts: withUniqueIds(sanitiseAll(obj.shifts, sanitiseShift), 'shift'),
    // v1 backups predate debts. They must still restore, since one may be the only copy
    // of shifts exported before this version was installed.
    debts: withUniqueIds(sanitiseAll(obj.debts, sanitiseDebt), 'debt'),
    settings: sanitiseSettings(obj.settings),
  }
}
