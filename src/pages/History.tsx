import { useMemo, useState } from 'react'
import { Card, ExtraBadge, HolidayBadge, Label, Legend, MARK_TEXT, MarkDot, Sheet, btn, field } from '../components/ui'
import { useAddPunch, useDeletePunch, useSetHoliday, useSettings, useUpdatePunch, useUpdateSettings } from '../lib/queries'
import { buildReport, shareOrDownload } from '../lib/report'
import { datesBetween, nextPeriod, periodFor, prevPeriod, type Period } from '../lib/pay'
import { usePeriod } from '../lib/usePeriod'
import { fmtDay, fmtHours, fmtMoney, fmtTime, localHHMM, workTimeToUtc, workToday } from '../lib/time'
import { breakMinutes, fmtMinutes, labelsFor, punchMark, type Punch, type PunchType, type Settings } from '../lib/types'

type Editing =
  | { mode: 'edit'; punch: Punch }
  | { mode: 'add'; date: string }
  | null

const TYPES: PunchType[] = ['clock_in', 'lunch_out', 'lunch_in', 'clock_out']

export default function History() {
  const s = useSettings().data!
  const tz = s.timezone
  const L = labelsFor(s)
  const today = workToday(new Date(), tz, s.day_start_hour)
  const current = useMemo(() => periodFor(today, s), [today, s])
  const [period, setPeriod] = useState<Period>(current)
  const { query, pay } = usePeriod(period, s)
  const setHoliday = useSetHoliday()
  const [editing, setEditing] = useState<Editing>(null)
  const [askName, setAskName] = useState(false)
  const [reportMsg, setReportMsg] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  async function sendReport(nameOverride?: Settings) {
    const settings = nameOverride ?? s
    if (!settings.display_name) { setAskName(true); return }
    if (!query.data || !pay) return
    setBuilding(true); setReportMsg(null)
    try {
      const file = await buildReport({ s: settings, period, punches: query.data.punches, days: query.data.days, pay: pay.days })
      const r = await shareOrDownload(file, `Hours ${fmtDay(period.start, { month: 'short', day: 'numeric' })} to ${fmtDay(period.end, { month: 'short', day: 'numeric' })}`)
      if (r === 'downloaded') setReportMsg(`Saved ${file.name}`)
    } catch (e) {
      setReportMsg(`Couldn't build the report: ${(e as Error).message}`)
    } finally {
      setBuilding(false)
    }
  }

  const t = pay?.totals
  const dates = datesBetween(period.start, period.end)
  const isCurrent = period.start === current.start

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <Card className="flex items-center justify-between py-3">
        <button aria-label="Previous period" onClick={() => setPeriod(prevPeriod(period, s))}
          className="h-11 w-11 rounded-xl border border-line text-xl text-mist active:scale-95">‹</button>
        <div className="text-center">
          <Label>{s.pay_frequency === 'weekly' ? 'Week ending' : 'Pay period'}</Label>
          <p className="mt-1 font-display text-sm text-fog">
            {s.pay_frequency === 'weekly' ? fmtDay(period.end) : `${fmtDay(period.start, { month: 'short', day: 'numeric' })} to ${fmtDay(period.end, { month: 'short', day: 'numeric' })}`}
          </p>
          <p className="text-xs text-mist">Pays {fmtDay(period.payDate)}</p>
        </div>
        <button aria-label="Next period" onClick={() => setPeriod(nextPeriod(period, s))} disabled={isCurrent}
          className="h-11 w-11 rounded-xl border border-line text-xl text-mist active:scale-95 disabled:opacity-30">›</button>
      </Card>

      {/* Totals */}
      <Card>
        {t && t.hours > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hours" value={fmtHours(t.hours)} />
              <Stat label="OT" value={fmtHours(t.ot + t.dt)} gold={t.ot + t.dt > 0} />
              <Stat label="Net" value={fmtMoney(t.net)} cyan />
            </div>
            <p className="mt-3 text-center text-xs text-mist">
              Gross {fmtMoney(t.gross)} · Reg {fmtHours(t.reg)}
              {t.dt > 0 && ` · DT ${fmtHours(t.dt)}`}
              {t.hol > 0 && ` · Holiday ${fmtHours(t.hol)}`}
            </p>
          </>
        ) : (
          <p className="text-center text-sm text-mist">{query.isLoading ? 'Loading…' : 'No punches this period.'}</p>
        )}
        {t && t.hours > 0 && (
          <div className="mt-3 flex justify-center">
            <button aria-label="Send hours report" disabled={building} onClick={() => sendReport()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-mist active:scale-95 disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
              </svg>
              {building ? 'Building report…' : 'Send hours report'}
            </button>
          </div>
        )}
        {reportMsg && <p className="mt-1 text-center text-xs text-mist">{reportMsg}</p>}
      </Card>

      <Legend />

      {/* Days, newest first */}
      {[...dates].reverse().map((date) => {
        if (date > today) return null
        const punches = (query.data?.punches ?? []).filter((p) => p.work_date === date)
        const info = query.data?.days.find((d) => d.work_date === date)
        const dp = pay?.days.get(date)
        const empty = punches.length === 0
        const lastType = punches.at(-1)?.punch_type
        const breakMins = breakMinutes(punches)

        return (
          <Card key={date} className={empty ? 'py-3 opacity-70' : ''}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fog">{fmtDay(date)}</span>
                {info?.is_extra_day && <ExtraBadge />}
                {info?.is_holiday && <HolidayBadge />}
              </div>
              {info && (
                <span className="text-right font-mono text-sm text-cyan">
                  {fmtHours(Number(info.net_hours))}
                  {(breakMins > 0 || info.auto_lunch_applied) && (
                    <span className="block text-[10px] text-mist">
                      {s.auto_lunch_enabled ? 'Lunch' : 'Break'} {info.auto_lunch_applied ? `${s.assumed_lunch_minutes}m` : fmtMinutes(breakMins)}
                    </span>
                  )}
                  {dp && dp.ot + dp.dt > 0 && <span className="block text-[10px] text-gold">+{fmtHours(dp.ot + dp.dt)} OT</span>}
                </span>
              )}
            </div>

            {!empty && (
              <ul className="mt-2 divide-y divide-line/60">
                {punches.map((p) => {
                  const m = punchMark(p)
                  return (
                    <li key={p.id}>
                      <button onClick={() => setEditing({ mode: 'edit', punch: p })}
                        className="flex w-full items-center justify-between gap-2 py-2.5 text-left active:opacity-70">
                        <span className="flex items-center gap-2 text-sm text-mist"><MarkDot mark={m} />{L[p.punch_type]}</span>
                        <span className={`font-mono ${m ? MARK_TEXT[m] : 'text-fog'}`}>{fmtTime(p.punched_at, tz)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {info?.auto_lunch_applied && (
              <p className="mt-2 text-xs text-amber">No lunch punched: {s.assumed_lunch_minutes} min deducted.</p>
            )}
            {info && !info.is_complete && date < today && (
              <p className="mt-2 text-xs text-amber">
                {lastType === 'clock_out' ? 'Missing clock in.' : 'Missing clock out.'}{' '}
                {s.missing_punch_mode === 'assume' ? 'The nightly check will fill it in.' : 'Tap + Add punch to fix.'}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between">
              <button onClick={() => setEditing({ mode: 'add', date })} className="text-xs font-medium text-cyan">+ Add punch</button>
              {!empty && (
                <button disabled={setHoliday.isPending}
                  onClick={() => setHoliday.mutate({ work_date: date, is_holiday: !info?.is_holiday })}
                  className={`text-xs font-medium ${info?.is_holiday ? 'text-rose' : 'text-mist'}`}>
                  {info?.is_holiday ? '◆ Holiday (undo)' : '◇ Mark holiday'}
                </button>
              )}
            </div>
          </Card>
        )
      })}

      <PunchSheet editing={editing} s={s} onClose={() => setEditing(null)} />
      <NameSheet open={askName} onClose={() => setAskName(false)}
        onSaved={(next) => { setAskName(false); void sendReport(next) }} />
    </div>
  )
}

function Stat({ label, value, gold, cyan }: { label: string; value: string; gold?: boolean; cyan?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`mt-1 font-mono text-lg font-bold ${gold ? 'text-gold' : cyan ? 'text-cyan' : 'text-fog'}`}>{value}</p>
    </div>
  )
}

function PunchSheet({ editing, s, onClose }: { editing: Editing; s: Settings; onClose: () => void }) {
  const tz = s.timezone
  const L = labelsFor(s)
  const update = useUpdatePunch()
  const add = useAddPunch()
  const del = useDeletePunch()

  const isEdit = editing?.mode === 'edit'
  const date = editing ? (isEdit ? editing.punch.work_date : editing.date) : ''
  const [time, setTime] = useState('')
  const [type, setType] = useState<PunchType>('clock_in')
  const [key, setKey] = useState<string | null>(null)

  const k = editing ? (isEdit ? editing.punch.id : `add-${editing.date}`) : null
  if (k !== key) {
    setKey(k)
    setTime(editing && isEdit ? localHHMM(editing.punch.punched_at, tz) : '')
    setType('clock_in')
  }

  const busy = update.isPending || add.isPending || del.isPending
  const err = update.error ?? add.error ?? del.error
  const [hh] = time.split(':').map(Number)
  const afterMidnight = !!time && hh < s.day_start_hour

  async function save() {
    if (!editing || !time) return
    const at = workTimeToUtc(date, time, tz, s.day_start_hour).toISOString()
    if (editing.mode === 'edit') await update.mutateAsync({ id: editing.punch.id, punched_at: at })
    else await add.mutateAsync({ punch_type: type, punched_at: at })
    onClose()
  }

  async function remove() {
    if (editing?.mode !== 'edit') return
    await del.mutateAsync(editing.punch.id)
    onClose()
  }

  const mark = isEdit ? punchMark(editing.punch) : null

  return (
    <Sheet open={!!editing} onClose={onClose}
      title={editing ? `${isEdit ? L[editing.punch.punch_type] : 'Add punch'} · ${fmtDay(date)}` : ''}>
      {mark === 'assumed' && isEdit && (
        <p className="mb-3 rounded-xl bg-amber/10 p-3 text-xs text-amber">
          {editing.punch.assumption_notes}. Saving a time marks it as edited.
        </p>
      )}
      {mark === 'edited' && isEdit && (
        <p className="mb-3 rounded-xl bg-violet/10 p-3 text-xs text-violet">
          {editing.punch.original_punched_at
            ? `Edited. Originally ${fmtTime(editing.punch.original_punched_at, tz)}.`
            : 'Added by hand.'}
        </p>
      )}

      {!isEdit && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`h-11 rounded-xl border text-sm ${type === t ? 'border-cyan text-cyan' : 'border-line text-mist'}`}>
              {L[t]}
            </button>
          ))}
        </div>
      )}

      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
      {afterMidnight && (
        <p className="mt-2 text-xs text-mist">After midnight: counts toward {fmtDay(date)}'s shift.</p>
      )}

      {err && <p className="mt-3 text-sm text-danger">{err.message}</p>}

      <div className="mt-4 space-y-2">
        <button className={btn.primary} disabled={busy || !time} onClick={save}>Save</button>
        {isEdit && <button className={btn.danger} disabled={busy} onClick={remove}>Delete punch</button>}
        <button className={btn.ghost} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

function NameSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (s: Settings) => void }) {
  const save = useUpdateSettings()
  const [name, setName] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Name for reports">
      <p className="mb-3 text-sm text-mist">Shown at the top of your hours report. You only need to do this once.</p>
      <input className={field} autoComplete="name" placeholder="First Last" value={name} onChange={(e) => setName(e.target.value)} />
      {save.error && <p className="mt-3 text-sm text-danger">{save.error.message}</p>}
      <div className="mt-4 space-y-2">
        <button className={btn.primary} disabled={!name.trim() || save.isPending}
          onClick={async () => onSaved(await save.mutateAsync({ display_name: name.trim() }))}>
          Save and create report
        </button>
        <button className={btn.ghost} onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}
