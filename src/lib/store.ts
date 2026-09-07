import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { format } from 'date-fns'
import type { AppData, Debt, DebtPayment, Job, PaymentMethod, Settings, Shift } from './types'

export const SCHEMA_VERSION = 2
const STORAGE_KEY = 'payday'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

export function defaultSettings(): Settings {
  return { currency: 'USD', weekStartsOn: 1 }
}

function defaultJob(): Job {
  return { id: uid(), name: 'My job', defaultRate: 0, archived: false }
}

/**
 * v1 had no debts and carried a fortnight anchor in settings. Jobs and shifts pass
 * through untouched, since losing them to a schema bump would mean losing real logged work.
 *
 * Exported so the migration can be tested directly rather than by reaching into
 * zustand's persistence internals.
 */
export function migrateState(persisted: unknown, version: number): AppData {
  if (version >= SCHEMA_VERSION) return persisted as AppData
  const state = (persisted ?? {}) as {
    jobs?: Job[]
    shifts?: Shift[]
    debts?: Debt[]
    settings?: Record<string, unknown>
  }
  const { fortnightAnchor: _dropped, ...settings } = state.settings ?? {}
  return {
    jobs: state.jobs && state.jobs.length > 0 ? state.jobs : [defaultJob()],
    shifts: state.shifts ?? [],
    debts: state.debts ?? [],
    settings: { ...defaultSettings(), ...settings } as Settings,
  }
}

export type ShiftInput = Omit<Shift, 'id' | 'createdAt' | 'updatedAt'>

type Store = AppData & {
  addShift: (input: ShiftInput) => string
  updateShift: (id: string, patch: Partial<ShiftInput>) => void
  deleteShift: (id: string) => void
  togglePaid: (id: string) => void
  /** Bulk "I got paid for this week" action. */
  markPaid: (ids: string[], paidDate: string, method?: PaymentMethod) => void

  addJob: (name: string, defaultRate: number) => string
  updateJob: (id: string, patch: Partial<Omit<Job, 'id'>>) => void
  deleteJob: (id: string) => void

  addDebt: (input: DebtInput) => string
  updateDebt: (id: string, patch: Partial<DebtInput>) => void
  deleteDebt: (id: string) => void
  addPayment: (debtId: string, payment: Omit<DebtPayment, 'id'>) => void
  removePayment: (debtId: string, paymentId: string) => void
  setDebtSettled: (id: string, settled: boolean, on?: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  replaceAll: (data: AppData) => void
}

export type DebtInput = Omit<
  Debt,
  'id' | 'payments' | 'settledAt' | 'createdAt' | 'updatedAt'
> & {
  payments?: DebtPayment[]
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      jobs: [defaultJob()],
      shifts: [],
      debts: [],
      settings: defaultSettings(),

      addShift: (input) => {
        const shift: Shift = { ...input, id: uid(), createdAt: nowISO(), updatedAt: nowISO() }
        set((s) => ({ shifts: [...s.shifts, shift] }))
        return shift.id
      },

      updateShift: (id, patch) =>
        set((s) => ({
          shifts: s.shifts.map((shift) =>
            shift.id === id ? { ...shift, ...patch, updatedAt: nowISO() } : shift,
          ),
        })),

      deleteShift: (id) => set((s) => ({ shifts: s.shifts.filter((shift) => shift.id !== id) })),

      togglePaid: (id) =>
        set((s) => ({
          shifts: s.shifts.map((shift) => {
            if (shift.id !== id) return shift
            const paid = !shift.paid
            return {
              ...shift,
              paid,
              // Clear the paid date when un-ticking, so a stale date can't linger.
              paidDate: paid ? (shift.paidDate ?? format(new Date(), 'yyyy-MM-dd')) : undefined,
              updatedAt: nowISO(),
            }
          }),
        })),

      markPaid: (ids, paidDate, method) => {
        const set_ = new Set(ids)
        set((s) => ({
          shifts: s.shifts.map((shift) =>
            set_.has(shift.id)
              ? {
                  ...shift,
                  paid: true,
                  paidDate,
                  paymentMethod: method ?? shift.paymentMethod,
                  updatedAt: nowISO(),
                }
              : shift,
          ),
        }))
      },

      addJob: (name, defaultRate) => {
        const job: Job = { id: uid(), name, defaultRate, archived: false }
        set((s) => ({ jobs: [...s.jobs, job] }))
        return job.id
      },

      updateJob: (id, patch) =>
        set((s) => ({ jobs: s.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)) })),

      // Jobs with history are archived rather than removed: deleting one would
      // orphan every shift that references it and break historical totals.
      deleteJob: (id) => {
        const used = get().shifts.some((shift) => shift.jobId === id)
        if (used) {
          get().updateJob(id, { archived: true })
          return
        }
        set((s) => ({ jobs: s.jobs.filter((job) => job.id !== id) }))
      },

      addDebt: (input) => {
        const debt: Debt = {
          ...input,
          payments: input.payments ?? [],
          id: uid(),
          createdAt: nowISO(),
          updatedAt: nowISO(),
        }
        set((s) => ({ debts: [...s.debts, debt] }))
        return debt.id
      },

      updateDebt: (id, patch) =>
        set((s) => ({
          debts: s.debts.map((debt) =>
            debt.id === id ? { ...debt, ...patch, updatedAt: nowISO() } : debt,
          ),
        })),

      deleteDebt: (id) => set((s) => ({ debts: s.debts.filter((debt) => debt.id !== id) })),

      addPayment: (debtId, payment) =>
        set((s) => ({
          debts: s.debts.map((debt) =>
            debt.id === debtId
              ? {
                  ...debt,
                  payments: [...debt.payments, { ...payment, id: uid() }],
                  updatedAt: nowISO(),
                }
              : debt,
          ),
        })),

      removePayment: (debtId, paymentId) =>
        set((s) => ({
          debts: s.debts.map((debt) =>
            debt.id === debtId
              ? {
                  ...debt,
                  payments: debt.payments.filter((p) => p.id !== paymentId),
                  // Removing the payment that closed a debt must reopen it, otherwise
                  // it would sit settled with money still outstanding.
                  settledAt: undefined,
                  updatedAt: nowISO(),
                }
              : debt,
          ),
        })),

      setDebtSettled: (id, settled, on) =>
        set((s) => ({
          debts: s.debts.map((debt) =>
            debt.id === id
              ? {
                  ...debt,
                  settledAt: settled ? (on ?? format(new Date(), 'yyyy-MM-dd')) : undefined,
                  updatedAt: nowISO(),
                }
              : debt,
          ),
        })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      replaceAll: (data) =>
        set({
          jobs: data.jobs.length > 0 ? data.jobs : [defaultJob()],
          shifts: data.shifts,
          debts: data.debts,
          settings: { ...defaultSettings(), ...data.settings },
        }),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      partialize: (s) => ({
        jobs: s.jobs,
        shifts: s.shifts,
        debts: s.debts,
        settings: s.settings,
      }),
      migrate: migrateState,
    },
  ),
)

export function activeJobs(jobs: Job[]): Job[] {
  return jobs.filter((job) => !job.archived)
}

export function jobName(jobs: Job[], jobId: string): string {
  return jobs.find((job) => job.id === jobId)?.name ?? 'Unknown job'
}
