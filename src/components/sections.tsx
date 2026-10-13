import type { ReactNode } from 'react'
import { Label, Segmented, Toggle, field } from './ui'
import { offsetFromPayday, paydayFromOffset, periodFor } from '../lib/pay'
import {
  DOW_LONG, DOW_SHORT, deviceTimezone, fmtDay, localDate, mondayInWeek, weekStartOf,
} from '../lib/time'
import type { PayFrequency, Settings } from '../lib/types'

export type SetFn = <K extends keyof Settings>(k: K, v: Settings[K]) => void
interface P { s: Settings; set: SetFn }

/* ---------------- Primitives ---------------- */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs text-mist">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}
    </label>
  )
}

export function Num({ label, value, onChange, step = '1', hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: string; hint?: ReactNode
}) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className={`${field} font-mono`} />
    </Field>
  )
}

export function Time({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="time" value={value.slice(0, 5)} onChange={(e) => onChange(e.target.value)} className={`${field} font-mono`} />
    </Field>
  )
}

const today = () => localDate(new Date(), deviceTimezone())

/** Crisp dots that render the same on every phone (unicode half-circles do not) */
export function DayDot({ kind }: { kind: 'weekly' | 'biweekly' | null }) {
  if (!kind) return <span className="inline-block h-2.5 w-2.5" />
  return (
    <span className="inline-block h-2.5 w-2.5 rounded-full border border-current align-middle"
      style={{ background: kind === 'weekly' ? 'currentColor' : 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }} />
  )
}

/* ---------------- Sections ---------------- */

export function PayRateSection({ s, set }: P) {
  return (
    <>
      <Label>Pay</Label>
      <Field label="Your name (shown on hours reports)">
        <input className={field} autoComplete="name" placeholder="First Last" value={s.display_name ?? ''}
          onChange={(e) => set('display_name', e.target.value || null)} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Num label="Hourly rate ($)" value={Number(s.regular_rate)} step="0.01" onChange={(v) => set('regular_rate', v)} />
        <Num label="Est. tax and deductions %" value={Math.round(Number(s.tax_rate) * 10000) / 100} step="0.5"
          onChange={(v) => set('tax_rate', v / 100)} />
      </div>
    </>
  )
}

export function OvertimeSection({ s, set }: P) {
  const rate = Number(s.regular_rate)
  const money = (m: number) => (rate > 0 ? `$${(rate * m).toFixed(2)}/hr` : '')
  return (
    <>
      <Label>Overtime</Label>
      <div className="grid grid-cols-2 gap-x-3">
        <Num label="Weekly OT after (hrs)" value={Number(s.overtime_threshold_hours)} onChange={(v) => set('overtime_threshold_hours', v)} />
        <Num label="OT multiplier" value={Number(s.ot_multiplier)} step="0.25" onChange={(v) => set('ot_multiplier', v)}
          hint={money(Number(s.ot_multiplier))} />
      </div>
      <Toggle checked={s.daily_ot_enabled} onChange={(v) => set('daily_ot_enabled', v)}
        label="Daily overtime" hint="OT for hours past a daily limit (California, Alaska, Nevada)" />
      {s.daily_ot_enabled && (
        <Num label="Daily OT after (hrs)" value={Number(s.daily_ot_after)} onChange={(v) => set('daily_ot_after', v)} />
      )}
      <Toggle checked={s.daily_dt_enabled} onChange={(v) => set('daily_dt_enabled', v)}
        label="Daily double time" hint="For very long days, e.g. past 12 hours" />
      {s.daily_dt_enabled && (
        <div className="grid grid-cols-2 gap-x-3">
          <Num label="Double time after (hrs)" value={Number(s.daily_dt_after)} onChange={(v) => set('daily_dt_after', v)} />
          <Num label="DT multiplier" value={Number(s.dt_multiplier)} step="0.25" onChange={(v) => set('dt_multiplier', v)}
            hint={money(Number(s.dt_multiplier))} />
        </div>
      )}
      <Num label="Holiday pay multiplier" value={Number(s.holiday_multiplier)} step="0.25"
        onChange={(v) => set('holiday_multiplier', v)}
        hint={<>Mark a day as a holiday in History. {money(Number(s.holiday_multiplier))}</>} />
      <Toggle checked={s.holiday_counts_toward_ot} onChange={(v) => set('holiday_counts_toward_ot', v)}
        label="Holiday hours count toward weekly OT"
        hint={s.holiday_counts_toward_ot
          ? 'Holiday hours also fill up the 40, so later days hit OT sooner.'
          : 'Holiday hours are paid on their own and do not affect overtime.'} />
    </>
  )
}

export function PayScheduleSection({ s, set }: P) {
  const { dow: paydayDow, lag } = paydayFromOffset(Number(s.payday_offset_days), s.week_start_dow)
  const setPayday = (dow: number, l: number) => set('payday_offset_days', offsetFromPayday(dow, l, s.week_start_dow))
  const period = periodFor(today(), s)

  return (
    <>
      <Label>Pay schedule</Label>
      <Field label="How often are you paid?">
        <Segmented<PayFrequency> value={s.pay_frequency} onChange={(v) => set('pay_frequency', v)}
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'biweekly', label: 'Every 2 wks' },
            { value: 'semimonthly', label: '1st & 15th' },
          ]} />
      </Field>

      {s.pay_frequency !== 'semimonthly' && (
        <Field label="Your workweek starts on" hint="Overtime is counted per workweek.">
          <select className={field} value={s.week_start_dow}
            onChange={(e) => {
              const w = Number(e.target.value)
              const keep = paydayFromOffset(Number(s.payday_offset_days), s.week_start_dow)
              set('week_start_dow', w)
              set('payday_offset_days', offsetFromPayday(keep.dow, keep.lag, w))
              set('biweekly_anchor_week', mondayInWeek(s.biweekly_anchor_week, w))
            }}>
            {DOW_LONG.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </Field>
      )}

      {s.pay_frequency === 'biweekly' && (
        <Field label="Pick any day from a recent pay period's first week"
          hint={`Current period: ${fmtDay(period.start)} to ${fmtDay(period.end)}`}>
          <input type="date" className={field} value={s.pay_period_anchor}
            onChange={(e) => e.target.value && set('pay_period_anchor', weekStartOf(e.target.value, s.week_start_dow))} />
        </Field>
      )}

      {s.pay_frequency === 'semimonthly' ? (
        <Num label="Payday is this many days after the period ends" value={Number(s.payday_offset_days)}
          onChange={(v) => set('payday_offset_days', v)} />
      ) : (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Payday">
            <select className={field} value={paydayDow} onChange={(e) => setPayday(Number(e.target.value), lag)}>
              {DOW_LONG.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </Field>
          <Field label="Paid">
            <select className={field} value={lag} onChange={(e) => setPayday(paydayDow, Number(e.target.value))}>
              <option value={0}>Right after</option>
              <option value={1}>1 week later</option>
              <option value={2}>2 weeks later</option>
            </select>
          </Field>
        </div>
      )}
      <p className="mt-2 text-xs text-cyan">
        This period: {fmtDay(period.start)} to {fmtDay(period.end)}, paid {fmtDay(period.payDate)}
      </p>
    </>
  )
}

export function ScheduleSection({ s, set }: P) {
  function cycleDay(d: number) {
    const weekly = s.weekly_days.includes(d)
    const bi = s.biweekly_days.includes(d)
    set('weekly_days', weekly ? s.weekly_days.filter((x) => x !== d) : bi ? s.weekly_days : [...s.weekly_days, d])
    set('biweekly_days', weekly ? [...s.biweekly_days, d] : s.biweekly_days.filter((x) => x !== d))
  }
  const order = Array.from({ length: 7 }, (_, i) => ((s.week_start_dow - 1 + i) % 7) + 1)

  return (
    <>
      <Label>Work schedule</Label>
      <Toggle checked={s.schedule_enabled} onChange={(v) => set('schedule_enabled', v)}
        label="I have a regular schedule"
        hint={s.schedule_enabled ? 'Days off the schedule get a ★ Extra day badge.' : 'Any day is fair game. No extra-day badges.'} />
      {s.schedule_enabled && (
        <>
          <p className="mt-3 text-xs text-mist">
            Tap to cycle: off, every week <span className="text-cyan"><DayDot kind="weekly" /></span>, every other week <span className="text-cyan"><DayDot kind="biweekly" /></span>
          </p>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {order.map((d) => {
              const weekly = s.weekly_days.includes(d)
              const bi = s.biweekly_days.includes(d)
              return (
                <button key={d} type="button" onClick={() => cycleDay(d)}
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs ${
                    weekly ? 'border-cyan bg-cyan/15 text-cyan' : bi ? 'border-dashed border-cyan/60 text-cyan' : 'border-line text-mist'}`}>
                  {DOW_SHORT[d - 1]}
                  <DayDot kind={weekly ? 'weekly' : bi ? 'biweekly' : null} />
                </button>
              )
            })}
          </div>
          {s.biweekly_days.length > 0 && (
            <Field label="Every-other days are worked the week of"
              hint={`Week starting ${fmtDay(weekStartOf(s.biweekly_anchor_week, s.week_start_dow))}. Any date in an "on" week works.`}>
              <input type="date" className={field} value={s.biweekly_anchor_week}
                onChange={(e) => e.target.value && set('biweekly_anchor_week', mondayInWeek(e.target.value, s.week_start_dow))} />
            </Field>
          )}
        </>
      )}
    </>
  )
}

export function BreaksSection({ s, set }: P) {
  return (
    <>
      <Label>Breaks</Label>
      <Toggle checked={s.auto_lunch_enabled} onChange={(v) => set('auto_lunch_enabled', v)}
        label="Unpaid lunch is required"
        hint={s.auto_lunch_enabled
          ? 'If you forget to punch lunch, it is deducted automatically.'
          : 'Breaks are optional. Punch them only when you take one.'} />
      {s.auto_lunch_enabled && (
        <div className="grid grid-cols-2 gap-x-3">
          <Num label="Lunch length (min)" value={Number(s.assumed_lunch_minutes)} onChange={(v) => set('assumed_lunch_minutes', v)} />
          <Num label="Only on shifts over (hrs)" value={Number(s.auto_lunch_min_shift_hours)} step="0.5"
            onChange={(v) => set('auto_lunch_min_shift_hours', v)} hint="0 = every shift" />
        </div>
      )}
    </>
  )
}

export function MissingSection({ s, set }: P) {
  return (
    <>
      <Label>Forgotten punches</Label>
      <Segmented<'assume' | 'flag'> value={s.missing_punch_mode} onChange={(v) => set('missing_punch_mode', v)}
        options={[{ value: 'flag', label: 'Flag for me' }, { value: 'assume', label: 'Fill in times' }]} />
      <p className="mt-2 text-xs text-mist">
        {s.missing_punch_mode === 'flag'
          ? 'Incomplete days are highlighted so you can fix them. Nothing is guessed.'
          : 'Each night, missing punches are filled with your usual times and marked Assumed.'}
      </p>
      {s.missing_punch_mode === 'assume' && (
        <div className="grid grid-cols-2 gap-x-3">
          <Time label="Usual clock in" value={s.assumed_clock_in} onChange={(v) => set('assumed_clock_in', v)} />
          <Time label="Usual clock out" value={s.assumed_clock_out} onChange={(v) => set('assumed_clock_out', v)} />
          <Time label="Nightly check at" value={s.sweep_time} onChange={(v) => set('sweep_time', v)} />
        </div>
      )}
    </>
  )
}

const US_ZONES = [
  ['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
]

function allZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    return fn ? fn('timeZone') : []
  } catch { return [] }
}

export function TimeSection({ s, set }: P) {
  const device = deviceTimezone()
  const others = allZones().filter((z) => !US_ZONES.some(([u]) => u === z))
  return (
    <>
      <Label>Time</Label>
      <Field label="Time zone" hint={device !== s.timezone ? `This phone is set to ${device}.` : undefined}>
        <select className={field} value={s.timezone} onChange={(e) => set('timezone', e.target.value)}>
          <optgroup label="United States">
            {US_ZONES.map(([z, name]) => <option key={z} value={z}>{name} ({z})</option>)}
          </optgroup>
          {!US_ZONES.some(([u]) => u === s.timezone) && !others.includes(s.timezone) &&
            <option value={s.timezone}>{s.timezone}</option>}
          {others.length > 0 && (
            <optgroup label="Everywhere else">
              {others.map((z) => <option key={z} value={z}>{z}</option>)}
            </optgroup>
          )}
        </select>
      </Field>
      <Field label="Late shifts count toward the previous day until"
        hint="For shifts that run past midnight, like 4 PM to 1 AM.">
        <select className={field} value={s.day_start_hour} onChange={(e) => set('day_start_hour', Number(e.target.value))}>
          {[0, 2, 3, 4, 5, 6].map((h) => (
            <option key={h} value={h}>{h === 0 ? 'Midnight (no late shifts)' : `${h}:00 AM`}</option>
          ))}
        </select>
      </Field>
    </>
  )
}
