import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSettled } from './lib/debt'
import {
  JOB,
  NOW,
  makeDebt,
  makeShift,
  renderApp,
  seedStore,
  setupUser,
  storeState,
  stubConfirm,
} from './test/helpers'

/** date/time inputs are text boxes under jsdom, so set them by change event. */
function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function row(times: string) {
  return screen.getByText(times).closest('.shift-row') as HTMLElement
}

function heroUnpaid() {
  return document.querySelector('.card-hero .card-value')!.textContent
}

function smallCards() {
  return [...document.querySelectorAll('.card-value-sm')].map((n) => n.textContent)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  seedStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('adding a shift', () => {
  it('saves what the live preview showed and lists it', async () => {
    const user = setupUser()
    renderApp('/shift/new')

    // Defaults come from the job's rate: 09:00-17:00, no break, $18.50/hr.
    expect(document.querySelector('.live-amount')).toHaveTextContent('$148.00')

    setField('End', '17:30')
    setField('Unpaid break (min)', '30')
    expect(document.querySelector('.live-amount')).toHaveTextContent('$148.00')
    expect(document.querySelector('.live-hours')).toHaveTextContent('8h')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const saved = storeState().shifts[0]!
    expect(saved).toMatchObject({
      date: '2026-07-31',
      start: '09:00',
      end: '17:30',
      breakMinutes: 30,
      rate: 18.5,
      paid: false,
    })
    expect(screen.getByText('9:00 AM – 5:30 PM')).toBeInTheDocument()
    expect(heroUnpaid()).toBe('$148.00')
  })

  it('handles an overnight shift and flags that it ends the next day', async () => {
    const user = setupUser()
    renderApp('/shift/new')

    setField('Start', '22:00')
    setField('End', '06:00')
    setField('Unpaid break (min)', '0')

    expect(document.querySelector('.live-amount')).toHaveTextContent('$148.00')
    expect(document.querySelector('.live-hours')).toHaveTextContent('ends next day')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    // Stored in 24-hour form, shown as 12-hour.
    expect(storeState().shifts[0]).toMatchObject({ start: '22:00', end: '06:00', rate: 18.5 })
    expect(screen.getByText('10:00 PM – 6:00 AM')).toBeInTheDocument()
  })

  it('shows midnight and noon correctly rather than as 0:00', async () => {
    const user = setupUser()
    renderApp('/shift/new')

    setField('Start', '00:00')
    setField('End', '12:00')
    setField('Unpaid break (min)', '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('12:00 AM – 12:00 PM')).toBeInTheDocument()
  })

  it('records how a shift was paid', async () => {
    const user = setupUser()
    renderApp('/shift/new')

    await user.click(screen.getByLabelText('Paid'))
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(storeState().shifts[0]).toMatchObject({
      paid: true,
      paymentMethod: 'cash',
      paidDate: '2026-07-31',
    })
  })

  it('does not store payment details for a shift left unpaid', async () => {
    const user = setupUser()
    renderApp('/shift/new')

    // Tick paid, choose cash, then change your mind and untick.
    await user.click(screen.getByLabelText('Paid'))
    await user.click(screen.getByRole('button', { name: 'Cash' }))
    await user.click(screen.getByLabelText('Paid'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const saved = storeState().shifts[0]!
    expect(saved.paid).toBe(false)
    expect(saved.paidDate).toBeUndefined()
    expect(saved.paymentMethod).toBeUndefined()
  })

  it('refuses a shift of zero hours', async () => {
    const user = setupUser()
    renderApp('/shift/new')
    setField('End', '09:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText(/zero hours/)).toBeInTheDocument()
    expect(storeState().shifts).toHaveLength(0)
  })

  it('refuses a shift with no rate rather than silently recording $0', async () => {
    const user = setupUser()
    seedStore({ jobs: [{ ...JOB, defaultRate: 0 }] })
    renderApp('/shift/new')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText(/hourly rate above/)).toBeInTheDocument()
    expect(storeState().shifts).toHaveLength(0)
  })

  it('discards the entry on Cancel', async () => {
    const user = setupUser()
    renderApp('/shift/new')
    setField('End', '19:00')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(storeState().shifts).toHaveLength(0)
  })
})

describe('editing and deleting', () => {
  it('opens an existing shift prefilled and saves the change in place', async () => {
    const user = setupUser()
    seedStore({ shifts: [makeShift({ id: 'a', note: 'Covered for Sam' })] })
    renderApp()

    await user.click(screen.getByText('9:00 AM – 5:30 PM'))

    expect(screen.getByLabelText('Date')).toHaveValue('2026-07-31')
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Covered for Sam')
    expect(document.querySelector('.live-amount')).toHaveTextContent('$148.00')

    setField('End', '19:30')
    expect(document.querySelector('.live-amount')).toHaveTextContent('$185.00') // 10h
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Edited, not duplicated.
    expect(storeState().shifts).toHaveLength(1)
    expect(storeState().shifts[0]).toMatchObject({ id: 'a', end: '19:30' })
    expect(heroUnpaid()).toBe('$185.00')
  })

  it('deletes a shift once confirmed', async () => {
    const user = setupUser()
    const confirm = stubConfirm(true)
    seedStore({ shifts: [makeShift({ id: 'a' }), makeShift({ id: 'b', start: '11:00', end: '15:00' })] })
    renderApp('/shift/a')

    await user.click(screen.getByRole('button', { name: 'Delete shift' }))

    expect(confirm).toHaveBeenCalled()
    expect(storeState().shifts.map((s) => s.id)).toEqual(['b'])
  })

  it('keeps the shift when the delete confirmation is dismissed', async () => {
    const user = setupUser()
    stubConfirm(false)
    seedStore({ shifts: [makeShift({ id: 'a' })] })
    renderApp('/shift/a')

    await user.click(screen.getByRole('button', { name: 'Delete shift' }))
    expect(storeState().shifts).toHaveLength(1)
  })

  it('offers no delete button when creating a shift', () => {
    renderApp('/shift/new')
    expect(screen.queryByRole('button', { name: 'Delete shift' })).not.toBeInTheDocument()
  })
})

describe('paid state from the list', () => {
  it('moves a shift between the unpaid and paid totals', async () => {
    const user = setupUser()
    seedStore({ shifts: [makeShift({ id: 'a' })] })
    renderApp()

    expect(heroUnpaid()).toBe('$148.00')
    await user.click(within(row('9:00 AM – 5:30 PM')).getByRole('button', { name: /Mark this shift as paid/ }))

    expect(heroUnpaid()).toBe('$0.00')
    expect(smallCards()[0]).toBe('$148.00')
    expect(storeState().shifts[0]!.paid).toBe(true)

    await user.click(within(row('9:00 AM – 5:30 PM')).getByRole('button', { name: /as unpaid/ }))
    expect(heroUnpaid()).toBe('$148.00')
    expect(storeState().shifts[0]!.paidDate).toBeUndefined()
  })

  it('marks a whole period paid in one go', async () => {
    const user = setupUser()
    const confirm = stubConfirm(true)
    seedStore({
      shifts: [
        makeShift({ id: 'a' }),
        makeShift({ id: 'b', date: '2026-07-30', start: '10:00', end: '14:00', breakMinutes: 0 }),
      ],
    })
    renderApp()

    await user.click(screen.getByRole('button', { name: /Mark 2 shifts paid/ }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Mark 2 shifts as paid?'))
    expect(heroUnpaid()).toBe('$0.00')
    expect(storeState().shifts.every((s) => s.paid)).toBe(true)
    expect(storeState().shifts.every((s) => s.paidDate === '2026-07-31')).toBe(true)
    expect(screen.queryByRole('button', { name: /shifts paid/ })).not.toBeInTheDocument()
  })

  it('leaves everything alone if the bulk confirmation is dismissed', async () => {
    const user = setupUser()
    stubConfirm(false)
    seedStore({ shifts: [makeShift({ id: 'a' })] })
    renderApp()

    await user.click(screen.getByRole('button', { name: /Mark 1 shift paid/ }))
    expect(storeState().shifts[0]!.paid).toBe(false)
  })

  it('only bulk-marks shifts inside the visible period', async () => {
    const user = setupUser()
    stubConfirm(true)
    seedStore({
      shifts: [makeShift({ id: 'thisWeek' }), makeShift({ id: 'lastMonth', date: '2026-06-10' })],
    })
    renderApp()

    await user.click(screen.getByRole('button', { name: /Mark 1 shift paid/ }))

    const byId = Object.fromEntries(storeState().shifts.map((s) => [s.id, s]))
    expect(byId.thisWeek?.paid).toBe(true)
    expect(byId.lastMonth?.paid).toBe(false)
  })
})

describe('period filters', () => {
  beforeEach(() => {
    seedStore({
      shifts: [
        makeShift({ id: 'fri', date: '2026-07-31' }), // this month
        makeShift({ id: 'june', date: '2026-06-10' }), // previous month
        makeShift({ id: 'march', date: '2026-03-05' }), // inside 6M, outside month
      ],
    })
  })

  it('opens on the current month', () => {
    renderApp()
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)
  })

  it('offers no fortnight period any more', () => {
    renderApp()
    expect(screen.queryByRole('tab', { name: '2 Weeks' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Week',
      'Month',
      '6M',
      'Year',
    ])
  })

  it('widens through week, month, 6M and year', async () => {
    const user = setupUser()
    renderApp()

    await user.click(screen.getByRole('tab', { name: 'Week' }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1) // 31 Jul only

    await user.click(screen.getByRole('tab', { name: 'Month' }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: '6M' }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(3)

    await user.click(screen.getByRole('tab', { name: 'Year' }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(3)
  })

  it('shows no date row while you are on the current period', () => {
    renderApp()
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Previous period' })).not.toBeInTheDocument()
  })

  // Without this you can swipe three months back and have nothing telling you
  // which period the totals belong to.
  it('reveals a period chip once you leave the current period, and hides it on return', async () => {
    const user = setupUser()
    renderApp()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const chip = await screen.findByRole('button', { name: /back to now/ })
    expect(chip).toHaveTextContent('June')

    await user.click(chip)
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
  })

  it('steps periods with the arrow keys', () => {
    renderApp()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: /back to now/ })).toHaveTextContent('June')
    expect(screen.getAllByText('9:00 AM – 5:30 PM')).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
  })

  it('resets the offset when the period unit changes', async () => {
    const user = setupUser()
    renderApp()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await user.click(screen.getByRole('tab', { name: 'Week' }))

    // Not "two weeks back", but back to the week containing today.
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
  })

  it('says so when a period is empty rather than looking broken', () => {
    seedStore({ shifts: [makeShift()] })
    renderApp()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Nothing in this period')).toBeInTheDocument()
  })
})

describe('swiping between periods', () => {
  function swipe(dx: number, dy = 0) {
    const main = document.querySelector('.main')!
    fireEvent.pointerDown(main, { clientX: 200, clientY: 300, pointerType: 'touch' })
    fireEvent.pointerUp(main, { clientX: 200 + dx, clientY: 300 + dy, pointerType: 'touch' })
  }

  beforeEach(() => {
    seedStore({ shifts: [makeShift({ date: '2026-07-31' })] })
  })

  it('goes back a period on a swipe right', () => {
    renderApp()
    swipe(150)
    expect(screen.getByRole('button', { name: /back to now/ })).toHaveTextContent('June')
  })

  it('goes forward on a swipe left', () => {
    renderApp()
    swipe(-150)
    expect(screen.getByRole('button', { name: /back to now/ })).toHaveTextContent('August')
  })

  // A drag that is mostly vertical is someone scrolling the list.
  it('does not change period on a vertical drag', () => {
    renderApp()
    swipe(70, 220)
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
  })

  it('ignores a tap', () => {
    renderApp()
    swipe(3, 2)
    expect(screen.queryByRole('button', { name: /back to now/ })).not.toBeInTheDocument()
  })
})

describe('filtering by paid state', () => {
  beforeEach(() => {
    seedStore({
      shifts: [
        makeShift({ id: 'unpaid', date: '2026-07-30', paid: false }),
        makeShift({
          id: 'paid',
          date: '2026-07-29',
          paid: true,
          start: '10:00',
          end: '14:00',
          breakMinutes: 0, // a clean 4h at $18.50 = $74.00
        }),
      ],
    })
  })

  it('narrows the list to unpaid and back again', async () => {
    const user = setupUser()
    renderApp()
    expect(document.querySelectorAll('.shift-row')).toHaveLength(2)

    const card = screen.getByRole('button', { name: /Unpaid/ })
    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)
    expect(screen.getByText('9:00 AM – 5:30 PM')).toBeInTheDocument()

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('.shift-row')).toHaveLength(2)
  })

  it('narrows to paid, and the two filters are mutually exclusive', async () => {
    const user = setupUser()
    renderApp()

    await user.click(screen.getByRole('button', { name: /Paid/ }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)
    expect(screen.getByText('10:00 AM – 2:00 PM')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Unpaid/ }))
    expect(screen.getByRole('button', { name: /Paid/ })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)
    expect(screen.getByText('9:00 AM – 5:30 PM')).toBeInTheDocument()
  })

  // The cards are what you filter *by*, so their figures must not move when tapped.
  it('keeps showing whole-period totals while filtered', async () => {
    const user = setupUser()
    renderApp()
    expect(heroUnpaid()).toBe('$148.00')
    expect(smallCards()[0]).toBe('$74.00')

    await user.click(screen.getByRole('button', { name: /Unpaid/ }))
    expect(heroUnpaid()).toBe('$148.00')
    expect(smallCards()[0]).toBe('$74.00')
  })

  it('explains an empty filtered list rather than looking like there are no shifts', async () => {
    const user = setupUser()
    seedStore({ shifts: [makeShift({ paid: true })] })
    renderApp()

    await user.click(screen.getByRole('button', { name: /Unpaid/ }))
    expect(screen.getByText('No unpaid shifts here')).toBeInTheDocument()
    expect(screen.getByText('Tap the card again to show everything.')).toBeInTheDocument()
  })
})

describe('heatmap', () => {
  it('colours a day green when paid and amber when unpaid', () => {
    seedStore({
      shifts: [
        makeShift({ id: 'a', date: '2026-07-15', paid: true }),
        makeShift({ id: 'b', date: '2026-07-20', paid: false }),
      ],
    })
    renderApp()
    // Scoped to the grid: the legend also carries a paid and an unpaid swatch.
    expect(document.querySelectorAll('.heat-grid .heat-paid')).toHaveLength(1)
    expect(document.querySelectorAll('.heat-grid .heat-unpaid')).toHaveLength(1)
  })

  it('lays the week view out as a row', async () => {
    const user = setupUser()
    seedStore({ shifts: [makeShift({ date: '2026-07-31' })] })
    renderApp()
    await user.click(screen.getByRole('tab', { name: 'Week' }))
    expect(document.querySelector('.heat-row')).toBeInTheDocument()
    expect(document.querySelectorAll('.heat-day')).toHaveLength(7)
  })
})

describe('settings', () => {
  it('does not rewrite saved shifts when the default rate changes', async () => {
    const user = setupUser()
    seedStore({ shifts: [makeShift({ id: 'a', rate: 18.5 })] })
    renderApp('/settings')

    fireEvent.change(screen.getByLabelText(/Default hourly rate/), { target: { value: '30' } })
    await user.click(screen.getByRole('link', { name: /Shifts/ }))

    expect(heroUnpaid()).toBe('$148.00')
    expect(storeState().shifts[0]!.rate).toBe(18.5)
  })

  it('applies the new default rate to the next shift entered', async () => {
    const user = setupUser()
    renderApp('/settings')
    fireEvent.change(screen.getByLabelText(/Default hourly rate/), { target: { value: '30' } })

    renderApp('/shift/new')
    expect(screen.getByLabelText('Rate ($/hr)')).toHaveValue(30)
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!)
    expect(storeState().shifts[0]!.rate).toBe(30)
  })

  it('honours a Sunday week start', async () => {
    const user = setupUser()
    // Sun 26 Jul falls in the previous week when weeks start on Monday.
    seedStore({ shifts: [makeShift({ id: 'sun', date: '2026-07-26' })] })
    renderApp()
    await user.click(screen.getByRole('tab', { name: 'Week' }))
    expect(document.querySelectorAll('.shift-row')).toHaveLength(0)

    await user.click(screen.getByRole('link', { name: /Settings/ }))
    await user.selectOptions(screen.getByLabelText('Week starts on'), '0')
    await user.click(screen.getByRole('link', { name: /Shifts/ }))
    await user.click(screen.getByRole('tab', { name: 'Week' }))

    expect(document.querySelectorAll('.shift-row')).toHaveLength(1)
  })

  it('no longer offers a fortnight anchor', () => {
    renderApp('/settings')
    expect(screen.queryByLabelText('Fortnight starts from')).not.toBeInTheDocument()
  })

  it('archives a job that has shifts and hides it from new entries', async () => {
    const user = setupUser()
    stubConfirm(true)
    seedStore({ shifts: [makeShift({ id: 'a', jobId: JOB.id })] })
    renderApp('/settings')

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(storeState().jobs[0]!.archived).toBe(true)

    // The archived job must not be offered for a brand new shift...
    renderApp('/shift/new')
    expect(within(screen.getByLabelText('Job')).queryByRole('option', { name: /Warehouse/ }))
      .not.toBeInTheDocument()
  })

  it('still offers an archived job inside its own shift, so editing cannot reassign it', () => {
    seedStore({
      jobs: [{ ...JOB, archived: true }, { id: 'j2', name: 'Cafe', defaultRate: 22, archived: false }],
      shifts: [makeShift({ id: 'a', jobId: JOB.id })],
    })
    renderApp('/shift/a')

    const select = screen.getByLabelText('Job') as HTMLSelectElement
    expect(select.value).toBe(JOB.id)
    expect(within(select).getByRole('option', { name: /Warehouse \(archived\)/ })).toBeInTheDocument()
  })

  it('warns to set a rate while every job is still at zero', async () => {
    const user = setupUser()
    seedStore({ jobs: [{ ...JOB, defaultRate: 0 }] })
    renderApp()
    expect(screen.getByText('Set your hourly rate')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Settings/ }))
    fireEvent.change(screen.getByLabelText(/Default hourly rate/), { target: { value: '18.5' } })
    await user.click(screen.getByRole('link', { name: /Shifts/ }))

    expect(screen.queryByText('Set your hourly rate')).not.toBeInTheDocument()
  })
})

describe('empty state', () => {
  it('invites a first shift', () => {
    renderApp()
    expect(screen.getByText('No shifts yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a shift' })).toBeInTheDocument()
  })
})

describe('debts', () => {
  it('records a debt and puts it in the right direction', async () => {
    const user = setupUser()
    renderApp('/debt/new')

    await user.type(screen.getByLabelText('Person'), 'Alex')
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '200' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const debt = storeState().debts[0]!
    expect(debt).toMatchObject({ person: 'Alex', amountCents: 20000, direction: 'owed_to_me' })
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('They owe me')).toBeInTheDocument()
  })

  it('records a debt the other way round', async () => {
    const user = setupUser()
    renderApp('/debt/new')

    await user.type(screen.getByLabelText('Person'), 'Sam')
    fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '50' } })
    await user.click(screen.getByRole('button', { name: 'I owe them' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(storeState().debts[0]!.direction).toBe('i_owe')
    expect(screen.getByText('I owe them')).toBeInTheDocument()
  })

  it('refuses a debt with no person or no amount', async () => {
    const user = setupUser()
    renderApp('/debt/new')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Who is this with?')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Person'), 'Alex')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Enter an amount above $0.')).toBeInTheDocument()
    expect(storeState().debts).toHaveLength(0)
  })

  it('shows both directions and the net position', () => {
    seedStore({
      debts: [
        makeDebt({ id: 'a', direction: 'owed_to_me', amountCents: 20000 }),
        makeDebt({ id: 'b', direction: 'i_owe', amountCents: 5000 }),
      ],
    })
    renderApp('/debts')

    const cards = [...document.querySelectorAll('.card-value-sm')].map((n) => n.textContent)
    expect(cards).toEqual(['$200.00', '$50.00'])
    expect(document.querySelector('.net')).toHaveTextContent('$150.00')
  })

  it('takes a part payment and moves the balance', async () => {
    const user = setupUser()
    seedStore({ debts: [makeDebt({ id: 'd', amountCents: 20000 })] })
    renderApp('/debt/d')

    fireEvent.change(screen.getByLabelText('Add payment ($)'), { target: { value: '50' } })
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(storeState().debts[0]!.payments).toHaveLength(1)
    expect(document.querySelector('.live-amount')).toHaveTextContent('$150.00')
    expect(document.querySelector('.live-hours')).toHaveTextContent('$50.00 of $200.00 paid')
  })

  // Settling should not need two actions: paying the remainder is settling.
  it('settles up in one tap and moves the debt out of the totals', async () => {
    const user = setupUser()
    seedStore({ debts: [makeDebt({ id: 'd', amountCents: 20000, payments: [] })] })
    renderApp('/debt/d')

    await user.click(screen.getByRole('button', { name: /Settle up/ }))
    expect(document.querySelector('.live-amount')).toHaveTextContent('$0.00')
    expect(document.querySelector('.live-hours')).toHaveTextContent('Settled')
    expect(isSettled(storeState().debts[0]!)).toBe(true)

    cleanup()
    renderApp('/debts')
    expect(document.querySelector('.net')).toHaveTextContent('$0.00')
    expect(screen.getByRole('heading', { name: 'Settled' })).toBeInTheDocument()
  })

  it('writes a debt off without payment, and reopens it', async () => {
    const user = setupUser()
    seedStore({ debts: [makeDebt({ id: 'd', amountCents: 20000 })] })
    renderApp('/debt/d')

    await user.click(screen.getByRole('button', { name: /Write off/ }))
    expect(storeState().debts[0]!.settledAt).toBe('2026-07-31')

    await user.click(screen.getByRole('button', { name: 'Reopen debt' }))
    expect(storeState().debts[0]!.settledAt).toBeUndefined()
  })

  it('deletes a debt once confirmed', async () => {
    const user = setupUser()
    stubConfirm(true)
    seedStore({ debts: [makeDebt({ id: 'd' })] })
    renderApp('/debt/d')

    await user.click(screen.getByRole('button', { name: 'Delete debt' }))
    expect(storeState().debts).toHaveLength(0)
  })

  it('invites a first debt', () => {
    renderApp('/debts')
    expect(screen.getByText('No debts tracked')).toBeInTheDocument()
  })

  it('is reachable from the bottom nav', () => {
    renderApp()
    expect(screen.getByRole('link', { name: /Debts/ })).toHaveAttribute('href', '#/debts')
  })
})
