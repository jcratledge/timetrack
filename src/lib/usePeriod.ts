import { useMemo } from 'react'
import { computeDays, sumDays, type DayPay, type Period, type Totals } from './pay'
import { useRange } from './queries'
import { weekStartOf } from './time'
import type { Settings } from './types'

export interface PeriodPay {
  days: Map<string, DayPay>
  totals: Totals
  weekReg: number          // regular hours so far in the workweek containing `focus`
}

/** Hours and pay for a pay period. Fetches from the start of the first
    workweek so overtime carried in from before the period is correct. */
export function usePeriod(period: Period, s: Settings, opts?: { live?: { date: string; hours: number }; focus?: string }) {
  const from = weekStartOf(period.start, s.week_start_dow)
  const q = useRange(from, period.end)
  const live = opts?.live
  const focus = opts?.focus ?? period.end

  const pay = useMemo<PeriodPay | null>(() => {
    if (!q.data) return null
    const input = q.data.days.map((d) => ({
      date: d.work_date,
      hours: Number(d.net_hours) + (live && live.date === d.work_date ? live.hours : 0),
      holiday: d.is_holiday,
    }))
    if (live && live.hours > 0 && !input.some((i) => i.date === live.date)) {
      input.push({ date: live.date, hours: live.hours, holiday: false })
    }
    const days = computeDays(input, s)
    const inPeriod = [...days.values()].filter((d) => d.date >= period.start && d.date <= period.end)
    const wk = weekStartOf(focus, s.week_start_dow)
    const weekReg = [...days.values()]
      .filter((d) => weekStartOf(d.date, s.week_start_dow) === wk)
      .reduce((a, d) => a + d.reg, 0)
    return { days, totals: sumDays(inPeriod, s.tax_rate), weekReg }
  }, [q.data, s, period.start, period.end, live, focus])

  return { query: q, pay }
}
