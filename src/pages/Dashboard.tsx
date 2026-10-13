import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, ExtraBadge, Label, MARK_TEXT, btn } from '../components/ui'
import { InstallPrompt } from '../components/InstallPrompt'
import { nextPunch, useClaimSeed, useRecordPunch, useSeedAvailable, useSettings } from '../lib/queries'
import { periodFor } from '../lib/pay'
import { usePeriod } from '../lib/usePeriod'
import { fmtDay, fmtHours, fmtMoney, fmtTime, workToday } from '../lib/time'
import { labelsFor, punchMark } from '../lib/types'

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export default function Dashboard() {
  const s = useSettings().data!
  const tz = s.timezone
  const L = labelsFor(s)
  const now = useNow()
  const today = workToday(new Date(now), tz, s.day_start_hour)
  const period = useMemo(() => periodFor(today, s), [today, s])

  const punch = useRecordPunch()
  const seed = useSeedAvailable()
  const claim = useClaimSeed()

  // First pass (no live) to find today's punches
  const base = usePeriod(period, s, { focus: today })
  const todays = useMemo(
    () => (base.query.data?.punches ?? []).filter((p) => p.work_date === today),
    [base.query.data, today],
  )
  const last = todays.at(-1)
  const onClock = !!last && (last.punch_type === 'clock_in' || last.punch_type === 'lunch_in')
  const liveHours = onClock ? Math.max(0, (now - new Date(last!.punched_at).getTime()) / 3_600_000) : 0
  const live = useMemo(() => ({ date: today, hours: liveHours }), [today, liveHours])
  const { pay } = usePeriod(period, s, { live, focus: today })

  // Button logic: required lunch => Lunch Out is primary; optional breaks => Clock Out is primary
  let primary = nextPunch(todays)
  let secondary: typeof primary | null = null
  if (primary === 'lunch_out') {
    if (s.auto_lunch_enabled) secondary = 'clock_out'
    else { primary = 'clock_out'; secondary = 'lunch_out' }
  }

  const t = pay?.totals
  const threshold = Number(s.overtime_threshold_hours)
  const weekPct = Math.min(100, ((pay?.weekReg ?? 0) / threshold) * 100)
  const days = base.query.data?.days.filter((d) => d.work_date >= period.start && d.work_date <= period.end) ?? []
  const extraDays = days.filter((d) => d.is_extra_day)
  const extraHours = extraDays.reduce((a, d) => a + Number(d.net_hours), 0)
  const hasAssumed = (base.query.data?.punches ?? []).some((p) => p.is_assumed && p.work_date >= period.start)
  const incomplete = days.filter((d) => !d.is_complete && d.work_date < today).length
  const weekly = s.pay_frequency === 'weekly'

  return (
    <div className="space-y-4">
      <InstallPrompt />

      {(seed.data ?? 0) > 0 && (
        <Card className="border-cyan/40">
          <p className="text-sm text-fog"><strong>{seed.data} historical punches</strong> are ready to import.</p>
          <button className={`${btn.ghost} mt-3`} disabled={claim.isPending} onClick={() => claim.mutate()}>
            {claim.isPending ? 'Importing…' : 'Import history'}
          </button>
        </Card>
      )}

      {/* Punch */}
      <Card className="flex flex-col items-center py-8">
        <Label>{fmtDay(today, { weekday: 'long', month: 'long', day: 'numeric' })}</Label>

        <button onClick={() => punch.mutate(primary)} disabled={punch.isPending || base.query.isLoading}
          className="glow mt-6 flex h-52 w-52 flex-col items-center justify-center rounded-full border-2 border-cyan bg-ink/80 transition active:scale-95 disabled:opacity-60">
          <span className="font-display text-xl tracking-wider text-cyan text-glow">
            {punch.isPending ? '…' : L[primary].toUpperCase()}
          </span>
          {onClock && (
            <span className="mt-3 font-mono text-sm text-mist">
              {last!.punch_type === 'lunch_in' ? 'back since' : 'in since'} {fmtTime(last!.punched_at, tz)}
            </span>
          )}
          {last?.punch_type === 'lunch_out' && (
            <span className="mt-3 font-mono text-sm text-mist">on break since {fmtTime(last.punched_at, tz)}</span>
          )}
        </button>

        {secondary && (
          <button className="mt-4 text-sm text-mist underline underline-offset-4"
            disabled={punch.isPending} onClick={() => punch.mutate(secondary!)}>
            {secondary === 'clock_out' ? 'Skip lunch, clock out' : 'Start a break'}
          </button>
        )}

        {punch.error && <p className="mt-3 text-sm text-danger">{punch.error.message}</p>}

        {todays.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {todays.map((p) => {
              const m = punchMark(p)
              return (
                <span key={p.id} className={`rounded-full border border-line px-3 py-1 font-mono text-xs ${m ? MARK_TEXT[m] : 'text-mist'}`}>
                  {L[p.punch_type]} {fmtTime(p.punched_at, tz)}
                </span>
              )
            })}
          </div>
        )}
      </Card>

      {/* Period totals */}
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>{weekly ? 'This week' : 'This pay period'}</Label>
          <span className="text-xs text-mist">Pays {fmtDay(period.payDate)}</span>
        </div>
        {!weekly && <p className="mt-1 text-xs text-mist">{fmtDay(period.start)} to {fmtDay(period.end)}</p>}

        <p className="mt-2 font-mono text-4xl font-bold text-fog">
          {fmtHours(t?.hours ?? 0)}
          {onClock && <span className="ml-2 align-middle text-xs font-normal text-cyan">● live</span>}
        </p>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink">
          <div className="h-full bg-cyan transition-all" style={{ width: `${weekPct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-mist">
          {weekly ? '' : 'This week: '}{fmtHours(pay?.weekReg ?? 0)} of {threshold}h before weekly OT
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-mist">Reg {fmtHours(t?.reg ?? 0)}</span>
          <span className={(t?.ot ?? 0) > 0 ? 'text-gold' : 'text-mist'}>OT {fmtHours(t?.ot ?? 0)}</span>
          {(t?.dt ?? 0) > 0 && <span className="text-gold">DT {fmtHours(t!.dt)}</span>}
          {(t?.hol ?? 0) > 0 && <span className="text-rose">Holiday {fmtHours(t!.hol)}</span>}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ink/70 p-3">
            <Label>Gross est.</Label>
            <p className="mt-1 font-mono text-xl font-bold">{fmtMoney(t?.gross ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-ink/70 p-3">
            <Label>Net est.</Label>
            <p className="mt-1 font-mono text-xl font-bold text-cyan">{fmtMoney(t?.net ?? 0)}</p>
          </div>
        </div>

        {extraDays.length > 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-mist">
            <ExtraBadge>{extraDays.length} extra {extraDays.length === 1 ? 'day' : 'days'}</ExtraBadge>
            <span>{fmtHours(extraHours)} above and beyond</span>
          </div>
        )}
        {(hasAssumed || incomplete > 0) && (
          <Link to="/history" className="mt-3 block text-xs text-amber">
            {incomplete > 0 ? `${incomplete} day${incomplete === 1 ? '' : 's'} missing punches.` : 'Includes assumed punches.'} Review in History →
          </Link>
        )}
      </Card>
    </div>
  )
}
