import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router'
import { vi } from 'vitest'
import App from '../App'
import { useStore } from '../lib/store'
import type { AppData, Debt, Job, Settings, Shift } from '../lib/types'

/** Fixed clock for every test: Friday 31 July 2026, midday local. */
export const NOW = new Date(2026, 6, 31, 12, 0, 0)

export const JOB: Job = { id: 'j1', name: 'Warehouse', defaultRate: 18.5, archived: false }

export const SETTINGS: Settings = {
  currency: 'USD',
  weekStartsOn: 1,
}

export function makeDebt(over: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    person: 'Alex',
    direction: 'owed_to_me',
    amountCents: 20000,
    date: '2026-07-20',
    payments: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

export function makeShift(over: Partial<Shift> = {}): Shift {
  return {
    id: 's1',
    jobId: JOB.id,
    date: '2026-07-31',
    start: '09:00',
    end: '17:30',
    breakMinutes: 30,
    rate: 18.5,
    paid: false,
    createdAt: '',
    updatedAt: '',
    ...over,
  }
}

/** Wipes persisted state and seeds the store directly, bypassing the UI. */
export function seedStore(data: Partial<AppData> = {}) {
  localStorage.clear()
  useStore.setState({
    jobs: data.jobs ?? [JOB],
    shifts: data.shifts ?? [],
    debts: data.debts ?? [],
    settings: data.settings ?? SETTINGS,
  })
}

export function storeState(): AppData {
  const { jobs, shifts, debts, settings } = useStore.getState()
  return { jobs, shifts, debts, settings }
}

/**
 * `delay: null` keeps user-event off the timer queue, so it stays compatible with
 * the faked system clock the date-dependent assertions rely on.
 */
export function setupUser() {
  return userEvent.setup({ delay: null })
}

export function renderApp(path = '/') {
  window.location.hash = path
  return render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
}

/** window.confirm is a no-op in jsdom; every destructive path needs it stubbed. */
export function stubConfirm(answer = true) {
  return vi.spyOn(window, 'confirm').mockReturnValue(answer)
}
