import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { buildBackup, backupFilename, parseBackup, saveBackup } from './backup'
import { JOB, NOW, SETTINGS, makeDebt, makeShift } from '../test/helpers'

// Capacitor plugins are lazy Proxies, so their methods are not own properties and
// cannot be spied on directly, so the modules have to be replaced wholesale.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn() },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))
vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn() },
}))

const isNative = vi.mocked(Capacitor.isNativePlatform)
const writeFile = vi.mocked(Filesystem.writeFile)
const share = vi.mocked(Share.share)

const data = { jobs: [JOB], shifts: [makeShift()], debts: [makeDebt()], settings: SETTINGS }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  isNative.mockReset().mockReturnValue(false)
  writeFile.mockReset()
  share.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildBackup', () => {
  it('tags the export so it can be identified on the way back in', () => {
    const backup = buildBackup(data)
    expect(backup.app).toBe('payday')
    expect(backup.version).toBe(2)
    expect(backup.exportedAt).toBe(NOW.toISOString())
    expect(backup.shifts).toEqual(data.shifts)
  })
})

describe('parseBackup', () => {
  it('round-trips an export without losing anything', () => {
    expect(parseBackup(JSON.stringify(buildBackup(data)))).toEqual(data)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseBackup('{oops')).toThrow(/valid JSON/)
  })

  it('rejects a JSON file that is not a Payday backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/Payday backup/)
  })

  it('rejects a bare JSON value', () => {
    expect(() => parseBackup('null')).toThrow(/Payday backup/)
    expect(() => parseBackup('42')).toThrow(/Payday backup/)
  })

  it('rejects a backup from a newer schema rather than silently mangling it', () => {
    const future = JSON.stringify({ ...buildBackup(data), version: 99 })
    expect(() => parseBackup(future)).toThrow(/newer version/)
  })

  it('accepts a backup from an older schema', () => {
    const old = JSON.stringify({ ...buildBackup(data), version: 0 })
    expect(parseBackup(old).shifts).toHaveLength(1)
  })

  // A v1 file may be the only copy of shifts exported before debts existed.
  // Refusing it, or dropping its shifts, would lose real logged work.
  it('restores a v1 backup that predates debts', () => {
    const v1 = JSON.stringify({
      app: 'payday',
      version: 1,
      exportedAt: NOW.toISOString(),
      jobs: [JOB],
      shifts: [makeShift({ id: 'old' })],
      settings: { currency: 'USD', weekStartsOn: 1, fortnightAnchor: '2026-07-27' },
    })
    const restored = parseBackup(v1)
    expect(restored.shifts.map((s) => s.id)).toEqual(['old'])
    expect(restored.jobs).toHaveLength(1)
    expect(restored.debts).toEqual([])
  })

  it('rejects a backup missing its arrays', () => {
    expect(() => parseBackup('{"app":"payday","version":1}')).toThrow(/jobs or shifts/)
    expect(() =>
      parseBackup('{"app":"payday","version":1,"jobs":[],"shifts":"nope"}'),
    ).toThrow(/jobs or shifts/)
  })
})

/**
 * A backup is a file off the user's phone, not something this app can vouch for.
 * The rule is that a malformed one loses its own bad fields and nothing else. It
 * must never land a value in the store that the totals then render as NaN.
 */
describe('parseBackup with untrusted input', () => {
  function backup(over: Record<string, unknown>): string {
    return JSON.stringify({ app: 'payday', version: 2, jobs: [], shifts: [], ...over })
  }

  it('keeps a non-numeric rate out of the earnings maths', () => {
    const restored = parseBackup(
      backup({ shifts: [{ date: '2026-07-31', rate: '18.50', breakMinutes: null }] }),
    )
    expect(restored.shifts[0].rate).toBe(0)
    expect(restored.shifts[0].breakMinutes).toBe(0)
  })

  it('refuses a negative amount rather than inverting a debt', () => {
    const restored = parseBackup(
      backup({ debts: [{ person: 'Alex', date: '2026-07-20', amountCents: -5000 }] }),
    )
    expect(restored.debts[0].amountCents).toBe(0)
  })

  it('drops a shift with no usable date, since it cannot be placed in a period', () => {
    const restored = parseBackup(
      backup({ shifts: [{ rate: 18.5 }, { date: '2026-07-31', rate: 18.5 }] }),
    )
    expect(restored.shifts).toHaveLength(1)
  })

  it('replaces a malformed clock time with a sane default', () => {
    const restored = parseBackup(backup({ shifts: [{ date: '2026-07-31', start: '25:99', end: 7 }] }))
    expect(restored.shifts[0]).toMatchObject({ start: '09:00', end: '17:00' })
  })

  it('drops a paid date from a shift that is not paid', () => {
    const restored = parseBackup(
      backup({ shifts: [{ date: '2026-07-31', paid: false, paidDate: '2026-08-01' }] }),
    )
    expect(restored.shifts[0].paidDate).toBeUndefined()
  })

  it('falls back to a known direction and payment method', () => {
    const restored = parseBackup(
      backup({
        shifts: [{ date: '2026-07-31', paymentMethod: 'crypto' }],
        debts: [{ person: 'Alex', date: '2026-07-20', direction: 'sideways' }],
      }),
    )
    expect(restored.shifts[0].paymentMethod).toBeUndefined()
    expect(restored.debts[0].direction).toBe('owed_to_me')
  })

  it('drops entries that are not objects at all', () => {
    expect(parseBackup(backup({ jobs: ['nope', null, 3] })).jobs).toEqual([])
  })

  it('drops a job with no name', () => {
    const restored = parseBackup(backup({ jobs: [{ name: '  ' }, { name: 'Warehouse' }] }))
    expect(restored.jobs.map((job) => job.name)).toEqual(['Warehouse'])
  })

  it('keeps only the well-formed payments against a debt', () => {
    const restored = parseBackup(
      backup({
        debts: [
          {
            person: 'Alex',
            date: '2026-07-20',
            payments: [{ date: 'whenever', amountCents: 100 }, { date: '2026-07-25', amountCents: 500 }],
          },
        ],
      }),
    )
    expect(restored.debts[0].payments).toHaveLength(1)
  })

  it('falls back to defaults for unusable settings', () => {
    expect(parseBackup(backup({ settings: 'nope' })).settings).toEqual(SETTINGS)
    expect(parseBackup(backup({ settings: { weekStartsOn: 9 } })).settings.weekStartsOn).toBe(1)
  })

  it('renames duplicate ids rather than importing a collision', () => {
    const restored = parseBackup(
      backup({
        shifts: [
          { id: 'same', date: '2026-07-31' },
          { id: 'same', date: '2026-07-30' },
        ],
      }),
    )
    expect(new Set(restored.shifts.map((shift) => shift.id)).size).toBe(2)
  })

  it('ignores a __proto__ key instead of letting it through', () => {
    const restored = parseBackup(
      '{"app":"payday","version":2,"jobs":[{"name":"Warehouse","__proto__":{"polluted":true}}],"shifts":[]}',
    )
    expect(restored.jobs[0].name).toBe('Warehouse')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('saveBackup in a browser', () => {
  it('downloads a dated .json file', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    await expect(saveBackup(data)).resolves.toBe('downloaded')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    // The object URL must be released, or the blob leaks for the page's lifetime.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    vi.unstubAllGlobals()
  })

  it('names the file by date', () => {
    expect(backupFilename(NOW)).toBe('payday-backup-2026-07-31.json')
  })
})

describe('saveBackup on Android', () => {
  // An <a download> is ignored by the Android WebView, so the packaged app must
  // write the file and hand it to the share sheet instead. Without this the
  // export button would appear to work and produce nothing.
  beforeEach(() => {
    isNative.mockReturnValue(true)
  })

  it('writes the file and offers it to the share sheet', async () => {
    writeFile.mockResolvedValue({ uri: 'file:///cache/payday-backup-2026-07-31.json' })
    share.mockResolvedValue({ activityType: '' })

    await expect(saveBackup(data)).resolves.toBe('shared')

    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'payday-backup-2026-07-31.json' }),
    )
    // The written JSON must be a real, parseable backup, not "[object Object]".
    const written = writeFile.mock.calls[0]![0].data as string
    expect(parseBackup(written)).toEqual(data)
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['file:///cache/payday-backup-2026-07-31.json'] }),
    )
  })

  it('never uses the browser download path on native', async () => {
    writeFile.mockResolvedValue({ uri: 'file:///cache/x.json' })
    share.mockResolvedValue({ activityType: '' })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    await saveBackup(data)
    expect(click).not.toHaveBeenCalled()
  })

  it('treats a dismissed share sheet as a cancel, not an error', async () => {
    writeFile.mockResolvedValue({ uri: 'file:///cache/x.json' })
    share.mockRejectedValue(new Error('Share canceled'))

    await expect(saveBackup(data)).resolves.toBe('cancelled')
  })

  it('surfaces a genuine write failure instead of pretending it saved', async () => {
    writeFile.mockRejectedValue(new Error('Disk full'))
    await expect(saveBackup(data)).rejects.toThrow('Disk full')
  })
})
