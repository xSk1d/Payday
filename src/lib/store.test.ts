import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION, activeJobs, jobName, migrateState, useStore } from './store'
import { debtBalanceCents, isSettled } from './debt'
import { JOB, NOW, SETTINGS, makeDebt, makeShift, seedStore } from '../test/helpers'

const api = () => useStore.getState()

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  seedStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('shifts', () => {
  it('adds a shift and stamps it with an id and timestamps', () => {
    const id = api().addShift({
      jobId: JOB.id,
      date: '2026-07-31',
      start: '09:00',
      end: '17:00',
      breakMinutes: 0,
      rate: 18.5,
      paid: false,
    })
    const shift = api().shifts[0]!
    expect(api().shifts).toHaveLength(1)
    expect(shift.id).toBe(id)
    expect(shift.createdAt).not.toBe('')
    expect(shift.updatedAt).not.toBe('')
  })

  it('updates only the targeted shift', () => {
    seedStore({ shifts: [makeShift({ id: 'a' }), makeShift({ id: 'b', rate: 20 })] })
    api().updateShift('a', { rate: 25 })
    expect(api().shifts.find((s) => s.id === 'a')?.rate).toBe(25)
    expect(api().shifts.find((s) => s.id === 'b')?.rate).toBe(20)
  })

  it('deletes a shift', () => {
    seedStore({ shifts: [makeShift({ id: 'a' }), makeShift({ id: 'b' })] })
    api().deleteShift('a')
    expect(api().shifts.map((s) => s.id)).toEqual(['b'])
  })
})

describe('paid state', () => {
  it('stamps a paid date when ticking a shift paid', () => {
    seedStore({ shifts: [makeShift({ id: 'a', paid: false })] })
    api().togglePaid('a')
    expect(api().shifts[0]!.paid).toBe(true)
    expect(api().shifts[0]!.paidDate).toBe('2026-07-31')
  })

  it('clears the paid date when un-ticking, so no stale date lingers', () => {
    seedStore({ shifts: [makeShift({ id: 'a', paid: true, paidDate: '2026-07-01' })] })
    api().togglePaid('a')
    expect(api().shifts[0]!.paid).toBe(false)
    expect(api().shifts[0]!.paidDate).toBeUndefined()
  })

  it('keeps an existing paid date rather than overwriting it on re-tick', () => {
    seedStore({ shifts: [makeShift({ id: 'a', paid: false, paidDate: '2026-07-01' })] })
    api().togglePaid('a')
    expect(api().shifts[0]!.paidDate).toBe('2026-07-01')
  })

  it('marks many shifts paid at once and leaves others alone', () => {
    seedStore({
      shifts: [makeShift({ id: 'a' }), makeShift({ id: 'b' }), makeShift({ id: 'c' })],
    })
    api().markPaid(['a', 'c'], '2026-08-05', 'bank')
    const byId = Object.fromEntries(api().shifts.map((s) => [s.id, s]))
    expect(byId.a?.paid).toBe(true)
    expect(byId.a?.paidDate).toBe('2026-08-05')
    expect(byId.a?.paymentMethod).toBe('bank')
    expect(byId.c?.paid).toBe(true)
    expect(byId.b?.paid).toBe(false)
  })

  it('does not overwrite an existing payment method during a bulk mark', () => {
    seedStore({ shifts: [makeShift({ id: 'a', paymentMethod: 'cash' })] })
    api().markPaid(['a'], '2026-08-05')
    expect(api().shifts[0]!.paymentMethod).toBe('cash')
  })
})

describe('jobs', () => {
  it('archives a job that has shifts instead of deleting it', () => {
    seedStore({ jobs: [JOB], shifts: [makeShift({ jobId: JOB.id })] })
    api().deleteJob(JOB.id)
    expect(api().jobs).toHaveLength(1)
    expect(api().jobs[0]!.archived).toBe(true)
    // The shift keeps its job and therefore its label and pay.
    expect(api().shifts[0]!.jobId).toBe(JOB.id)
    expect(jobName(api().jobs, JOB.id)).toBe('Warehouse')
  })

  it('really deletes a job that has no shifts', () => {
    seedStore({ jobs: [JOB], shifts: [] })
    api().deleteJob(JOB.id)
    expect(api().jobs).toHaveLength(0)
  })

  it('hides archived jobs from the picker but keeps resolving their name', () => {
    seedStore({ jobs: [JOB, { id: 'j2', name: 'Cafe', defaultRate: 22, archived: true }] })
    expect(activeJobs(api().jobs).map((j) => j.id)).toEqual(['j1'])
    expect(jobName(api().jobs, 'j2')).toBe('Cafe')
  })

  it('falls back to a readable label for a job that no longer exists', () => {
    expect(jobName([], 'ghost')).toBe('Unknown job')
  })
})

describe('replaceAll', () => {
  it('replaces everything with the imported data', () => {
    seedStore({ shifts: [makeShift({ id: 'old' })] })
    api().replaceAll({
      jobs: [{ id: 'x', name: 'Cafe', defaultRate: 22, archived: false }],
      shifts: [makeShift({ id: 'new' })],
      debts: [makeDebt({ id: 'd' })],
      settings: { currency: 'USD', weekStartsOn: 0 },
    })
    expect(api().shifts.map((s) => s.id)).toEqual(['new'])
    expect(api().jobs.map((j) => j.name)).toEqual(['Cafe'])
    expect(api().debts.map((d) => d.id)).toEqual(['d'])
    expect(api().settings.weekStartsOn).toBe(0)
  })

  it('seeds a default job if the import contains none, so the app is never unusable', () => {
    api().replaceAll({ jobs: [], shifts: [], debts: [], settings: undefined as never })
    expect(api().jobs).toHaveLength(1)
    expect(api().settings.weekStartsOn).toBe(1)
  })
})

describe('debts', () => {
  const input = {
    person: 'Alex',
    direction: 'owed_to_me' as const,
    amountCents: 20000,
    date: '2026-07-20',
  }

  it('adds a debt with an empty payment list', () => {
    const id = api().addDebt(input)
    const debt = api().debts[0]!
    expect(debt.id).toBe(id)
    expect(debt.payments).toEqual([])
    expect(debt.settledAt).toBeUndefined()
  })

  it('records part payments', () => {
    seedStore({ debts: [makeDebt({ id: 'd', amountCents: 20000 })] })
    api().addPayment('d', { date: '2026-07-25', amountCents: 5000 })
    api().addPayment('d', { date: '2026-07-28', amountCents: 2500 })
    expect(api().debts[0]!.payments).toHaveLength(2)
    expect(debtBalanceCents(api().debts[0]!)).toBe(12500)
  })

  // Pulling the payment that closed a debt must reopen it, or it would sit
  // settled with money still outstanding.
  it('reopens a debt when the payment that closed it is removed', () => {
    seedStore({ debts: [makeDebt({ id: 'd', amountCents: 10000 })] })
    api().addPayment('d', { date: '2026-07-25', amountCents: 10000 })
    expect(isSettled(api().debts[0]!)).toBe(true)

    const paymentId = api().debts[0]!.payments[0]!.id
    api().removePayment('d', paymentId)
    expect(api().debts[0]!.payments).toEqual([])
    expect(isSettled(api().debts[0]!)).toBe(false)
    expect(debtBalanceCents(api().debts[0]!)).toBe(10000)
  })

  it('writes a debt off and reopens it without touching payments', () => {
    seedStore({ debts: [makeDebt({ id: 'd' })] })
    api().setDebtSettled('d', true)
    expect(api().debts[0]!.settledAt).toBe('2026-07-31')
    api().setDebtSettled('d', false)
    expect(api().debts[0]!.settledAt).toBeUndefined()
  })

  it('updates and deletes', () => {
    seedStore({ debts: [makeDebt({ id: 'd', person: 'Alex' }), makeDebt({ id: 'e' })] })
    api().updateDebt('d', { person: 'Sam' })
    expect(api().debts.find((x) => x.id === 'd')?.person).toBe('Sam')
    api().deleteDebt('d')
    expect(api().debts.map((x) => x.id)).toEqual(['e'])
  })
})

describe('migration from v1', () => {
  // The real risk of this release: a phone holding v1 data with actual logged shifts.
  it('keeps jobs and shifts, adds debts, and drops the fortnight anchor', () => {
    const v1 = {
      jobs: [JOB],
      shifts: [makeShift({ id: 'old' })],
      settings: { currency: 'USD', weekStartsOn: 0, fortnightAnchor: '2026-07-27' },
    }
    const migrated = migrateState(v1, 1)
    expect(migrated.shifts.map((s) => s.id)).toEqual(['old'])
    expect(migrated.jobs).toHaveLength(1)
    expect(migrated.debts).toEqual([])
    expect(migrated.settings.weekStartsOn).toBe(0)
    expect('fortnightAnchor' in migrated.settings).toBe(false)
  })

  it('survives a v1 state that is missing pieces', () => {
    const migrated = migrateState({}, 1)
    expect(migrated.jobs).toHaveLength(1)
    expect(migrated.shifts).toEqual([])
    expect(migrated.debts).toEqual([])
  })

  it('leaves current-version state untouched', () => {
    const current = { jobs: [JOB], shifts: [], debts: [makeDebt()], settings: SETTINGS }
    expect(migrateState(current, SCHEMA_VERSION)).toEqual(current)
  })
})

describe('persistence', () => {
  it('writes changes through to localStorage', () => {
    api().addShift({
      jobId: JOB.id,
      date: '2026-07-31',
      start: '09:00',
      end: '17:00',
      breakMinutes: 0,
      rate: 18.5,
      paid: false,
    })
    const raw = localStorage.getItem('payday')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { version: number; state: { shifts: unknown[] } }
    expect(parsed.version).toBe(SCHEMA_VERSION)
    expect(parsed.state.shifts).toHaveLength(1)
  })
})
