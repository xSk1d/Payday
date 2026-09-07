/** How the money actually reached you. Cash never appears in a bank feed, so this
 *  field is what will let synced transactions be reconciled against manual entries
 *  if bank sync is ever added. */
export type PaymentMethod = 'cash' | 'bank' | 'other'

export type Job = {
  id: string
  name: string
  /** Dollars per hour. Used only to prefill new shifts, never to recompute old ones. */
  defaultRate: number
  archived: boolean
}

export type Shift = {
  id: string
  jobId: string
  /** 'YYYY-MM-DD'. The local calendar date the shift STARTED on. */
  date: string
  /** 'HH:mm' */
  start: string
  /** 'HH:mm'. If earlier than `start`, the shift crosses midnight. */
  end: string
  breakMinutes: number
  /** Snapshot of the hourly rate used for THIS shift, in dollars. Editing a job's
   *  default rate later must not retroactively change what past shifts earned. */
  rate: number
  paid: boolean
  /** 'YYYY-MM-DD' */
  paidDate?: string
  paymentMethod?: PaymentMethod
  note?: string
  createdAt: string
  updatedAt: string
}

export type Settings = {
  currency: 'USD'
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
}

/** Which way the money flows. */
export type DebtDirection = 'owed_to_me' | 'i_owe'

export type DebtPayment = {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  amountCents: number
  note?: string
}

export type Debt = {
  id: string
  person: string
  direction: DebtDirection
  /** The original amount, in integer cents, same reasoning as shift earnings. */
  amountCents: number
  /** 'YYYY-MM-DD'. When the debt started. */
  date: string
  note?: string
  /** Part payments made against it. A debt settles once these cover the amount. */
  payments: DebtPayment[]
  /** 'YYYY-MM-DD', set when the debt was cleared. */
  settledAt?: string
  createdAt: string
  updatedAt: string
}

export type AppData = {
  jobs: Job[]
  shifts: Shift[]
  debts: Debt[]
  settings: Settings
}

/** Shape written by "Export backup". Versioned so a future import can migrate. */
export type Backup = AppData & {
  app: 'payday'
  version: number
  exportedAt: string
}
