import { useRef, useState } from 'react'
import { parseBackup, saveBackup } from '../lib/backup'
import { parseRate } from '../lib/money'
import { useStore } from '../lib/store'

export default function SettingsPage() {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const debts = useStore((s) => s.debts)
  const settings = useStore((s) => s.settings)
  const addJob = useStore((s) => s.addJob)
  const updateJob = useStore((s) => s.updateJob)
  const deleteJob = useStore((s) => s.deleteJob)
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceAll = useStore((s) => s.replaceAll)

  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null)

  function shiftsUsing(jobId: string) {
    return shifts.filter((s) => s.jobId === jobId).length
  }

  function handleRemoveJob(id: string, name: string) {
    const used = shiftsUsing(id)
    const prompt = used
      ? `"${name}" is used by ${String(used)} shift${used === 1 ? '' : 's'}, so it will be archived rather than deleted. Those shifts keep their pay. Continue?`
      : `Delete "${name}"?`
    if (!window.confirm(prompt)) return
    deleteJob(id)
  }

  async function handleExport() {
    setMessage(null)
    try {
      const result = await saveBackup({ jobs, shifts, debts, settings })
      if (result === 'shared') setMessage({ text: 'Backup ready. Choose where to save it.' })
      else if (result === 'downloaded') setMessage({ text: 'Backup downloaded.' })
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Could not write the backup.',
        bad: true,
      })
    }
  }

  async function handleImport(file: File) {
    setMessage(null)
    try {
      const data = parseBackup(await file.text())
      const nShifts = data.shifts.length
      const nJobs = data.jobs.length
      const ok = window.confirm(
        `Import ${String(nShifts)} shift${nShifts === 1 ? '' : 's'} and ` +
          `${String(nJobs)} job${nJobs === 1 ? '' : 's'}?\n\n` +
          'This REPLACES everything currently in the app.',
      )
      if (!ok) return
      replaceAll(data)
      setMessage({ text: `Imported ${String(nShifts)} shift${nShifts === 1 ? '' : 's'}.` })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Import failed.', bad: true })
    }
  }

  return (
    <>
      <header className="header">
        <h1 className="header-title">Settings</h1>
      </header>

      <main className="main">
        <section className="group">
          <h2 className="group-title">Jobs</h2>
          <p className="group-hint">
            The rate here only prefills new shifts. Changing it never alters shifts you have
            already saved.
          </p>
          {jobs.map((job) => (
            <div key={job.id} className={job.archived ? 'job job-archived' : 'job'}>
              <input
                className="job-name"
                value={job.name}
                aria-label="Job name"
                onChange={(e) => updateJob(job.id, { name: e.target.value })}
              />
              <div className="job-rate">
                <span className="job-rate-prefix">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-label={`Default hourly rate for ${job.name}`}
                  value={job.defaultRate}
                  onChange={(e) => updateJob(job.id, { defaultRate: parseRate(e.target.value) })}
                />
                <span className="job-rate-suffix">/hr</span>
              </div>
              {job.archived ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => updateJob(job.id, { archived: false })}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="link-btn link-btn-danger"
                  onClick={() => handleRemoveJob(job.id, job.name)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-wide" onClick={() => addJob('New job', 0)}>
            Add job
          </button>
        </section>

        <section className="group">
          <h2 className="group-title">Periods</h2>
          <div className="field">
            <label htmlFor="weekStart">Week starts on</label>
            <select
              id="weekStart"
              value={settings.weekStartsOn}
              onChange={(e) =>
                updateSettings({ weekStartsOn: Number(e.target.value) === 0 ? 0 : 1 })
              }
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </div>
        </section>

        <section className="group">
          <h2 className="group-title">Backup</h2>
          <p className="group-hint">
            Your data lives only in this browser. Clearing site data or switching device loses
            it, so export regularly.
          </p>
          <button
            type="button"
            className="btn btn-wide"
            onClick={() => void handleExport()}
          >
            Export backup ({shifts.length} shift{shifts.length === 1 ? '' : 's'})
          </button>
          <button type="button" className="btn btn-wide" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImport(file)
              e.target.value = '' // allow re-picking the same file
            }}
          />
          {message ? (
            <p className={message.bad ? 'error' : 'notice'}>{message.text}</p>
          ) : null}
        </section>

        <p className="footnote">
          Payday · all data stored on this device · {shifts.length} shifts logged
        </p>
      </main>
    </>
  )
}
