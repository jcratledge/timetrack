/* Pay engine. One implementation used by the Clock and History screens.

   Rules (per workweek, processed day by day in order):
   1. Holiday days: all hours paid at holiday_multiplier. By default they are
      kept out of the weekly OT count; with holiday_counts_toward_ot they also
      count toward the threshold, pushing later days into OT sooner.
   2. Daily rules (optional): hours past daily_ot_after are OT; hours past
      daily_dt_after are double time.
   3. Weekly rule (always): regular hours past the weekly threshold become OT,
      assigned to the day that crossed it. OT is per workweek even when the
      pay period is biweekly or semimonthly, matching how payroll does it.
*/
import { addDays, diffDays, endOfMonth, isoDow, weekStartOf } from './time'
import type { PayFrequency, Settings } from './types'

export interface DayInput { date: string; hours: number; holiday: boolean }

export interface DayPay {
  date: string
  hours: number
  reg: number
  ot: number
  dt: number
  hol: number
  gross: number
}

export interface Totals {
  hours: number
  reg: number
  ot: number
  dt: number
  hol: number
  gross: number
  net: number
}

type PayRules = Pick<Settings,
  'regular_rate' | 'tax_rate' | 'overtime_threshold_hours' | 'ot_multiplier' |
  'daily_ot_enabled' | 'daily_ot_after' | 'daily_dt_enabled' | 'daily_dt_after' |
  'dt_multiplier' | 'holiday_multiplier' | 'holiday_counts_toward_ot' | 'week_start_dow'>

const n = (v: unknown) => Number(v)

export function computeDays(input: DayInput[], s: PayRules): Map<string, DayPay> {
  const rate = n(s.regular_rate)
  const out = new Map<string, DayPay>()
  const byWeek = new Map<string, DayInput[]>()
  for (const d of input) {
    const wk = weekStartOf(d.date, s.week_start_dow)
    if (!byWeek.has(wk)) byWeek.set(wk, [])
    byWeek.get(wk)!.push(d)
  }

  for (const days of byWeek.values()) {
    days.sort((a, b) => a.date.localeCompare(b.date))
    let regSoFar = 0
    for (const d of days) {
      const h = Math.max(0, n(d.hours))
      let reg = 0, ot = 0, dt = 0, hol = 0

      if (d.holiday) {
        hol = h
        if (s.holiday_counts_toward_ot) regSoFar += h
      } else {
        dt = s.daily_dt_enabled ? Math.max(0, h - n(s.daily_dt_after)) : 0
        const cap = s.daily_dt_enabled ? Math.min(h, n(s.daily_dt_after)) : h
        const dailyOt = s.daily_ot_enabled ? Math.max(0, cap - n(s.daily_ot_after)) : 0
        reg = h - dt - dailyOt
        const weeklyOt = Math.max(0, Math.min(reg, regSoFar + reg - n(s.overtime_threshold_hours)))
        reg -= weeklyOt
        ot = dailyOt + weeklyOt
        regSoFar += reg
      }

      const gross = rate * (reg + ot * n(s.ot_multiplier) + dt * n(s.dt_multiplier) + hol * n(s.holiday_multiplier))
      out.set(d.date, { date: d.date, hours: h, reg, ot, dt, hol, gross })
    }
  }
  return out
}

export function sumDays(days: Iterable<DayPay>, taxRate: number): Totals {
  const t: Totals = { hours: 0, reg: 0, ot: 0, dt: 0, hol: 0, gross: 0, net: 0 }
  for (const d of days) {
    t.hours += d.hours; t.reg += d.reg; t.ot += d.ot; t.dt += d.dt; t.hol += d.hol; t.gross += d.gross
  }
  t.net = t.gross * (1 - n(taxRate))
  return t
}

/* ---------------- Pay periods ---------------- */

export interface Period { start: string; end: string; payDate: string }

type PeriodRules = Pick<Settings, 'pay_frequency' | 'pay_period_anchor' | 'payday_offset_days' | 'week_start_dow'>

export function periodFor(date: string, s: PeriodRules): Period {
  let start: string, end: string
  const freq: PayFrequency = s.pay_frequency
  if (freq === 'semimonthly') {
    const day = Number(date.slice(8, 10))
    const ym = date.slice(0, 8)
    if (day <= 15) { start = `${ym}01`; end = `${ym}15` }
    else { start = `${ym}16`; end = endOfMonth(date) }
  } else if (freq === 'biweekly') {
    const wk = weekStartOf(date, s.week_start_dow)
    const anchor = weekStartOf(s.pay_period_anchor, s.week_start_dow)
    const weeks = Math.round(diffDays(wk, anchor) / 7)
    start = addDays(wk, -7 * (((weeks % 2) + 2) % 2))
    end = addDays(start, 13)
  } else {
    start = weekStartOf(date, s.week_start_dow)
    end = addDays(start, 6)
  }
  return { start, end, payDate: addDays(end, n(s.payday_offset_days)) }
}

export const prevPeriod = (p: Period, s: PeriodRules) => periodFor(addDays(p.start, -1), s)
export const nextPeriod = (p: Period, s: PeriodRules) => periodFor(addDays(p.end, 1), s)

/** Every date from a to b inclusive */
export function datesBetween(a: string, b: string): string[] {
  const out: string[] = []
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d)
  return out
}

/* ---------------- Payday as weekday + lag (weekly/biweekly) ---------------- */

/** Last day of a workweek as ISO weekday */
export const weekEndDow = (weekStartDow: number) => ((weekStartDow + 5) % 7) + 1

export function offsetFromPayday(paydayDow: number, lagWeeks: number, weekStartDow: number): number {
  let d = (paydayDow - weekEndDow(weekStartDow) + 7) % 7
  if (d === 0) d = 7
  return d + 7 * lagWeeks
}

export function paydayFromOffset(offset: number, weekStartDow: number): { dow: number; lag: number } {
  const end = weekEndDow(weekStartDow)
  return { dow: ((end - 1 + offset) % 7) + 1, lag: Math.max(0, Math.floor((offset - 1) / 7)) }
}

export { isoDow }
