export type PunchType = 'clock_in' | 'lunch_out' | 'lunch_in' | 'clock_out'
export type PunchSource = 'app' | 'sweep' | 'import' | 'manual'
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly'

export interface Settings {
  user_id: string
  display_name: string | null
  timezone: string
  setup_completed: boolean

  regular_rate: number
  tax_rate: number
  overtime_threshold_hours: number
  ot_multiplier: number
  daily_ot_enabled: boolean
  daily_ot_after: number
  daily_dt_enabled: boolean
  daily_dt_after: number
  dt_multiplier: number
  holiday_multiplier: number
  holiday_counts_toward_ot: boolean

  pay_frequency: PayFrequency
  pay_period_anchor: string
  payday_offset_days: number
  week_start_dow: number
  day_start_hour: number

  schedule_enabled: boolean
  weekly_days: number[]
  biweekly_days: number[]
  biweekly_anchor_week: string

  auto_lunch_enabled: boolean
  assumed_lunch_minutes: number
  auto_lunch_min_shift_hours: number

  missing_punch_mode: 'assume' | 'flag'
  sweep_time: string
  assumed_clock_in: string
  assumed_clock_out: string

  offline_queue_enabled: boolean
}

export interface Punch {
  id: string
  punched_at: string
  work_date: string
  punch_type: PunchType
  source: PunchSource
  is_assumed: boolean
  assumption_notes: string | null
  original_punched_at: string | null
  edited_at: string | null
}

export interface DayHours {
  work_date: string
  week_start: string
  is_complete: boolean
  has_assumed_punch: boolean
  auto_lunch_applied: boolean
  is_extra_day: boolean
  is_holiday: boolean
  raw_hours: number
  net_hours: number
}

export const PUNCH_LABEL: Record<PunchType, string> = {
  clock_in: 'Clock In',
  lunch_out: 'Break Start',
  lunch_in: 'Break End',
  clock_out: 'Clock Out',
}

/** Josh-style labels when breaks are a scheduled lunch */
export const LUNCH_LABEL: Record<PunchType, string> = {
  clock_in: 'Clock In',
  lunch_out: 'Lunch Start',
  lunch_in: 'Lunch End',
  clock_out: 'Clock Out',
}

export const labelsFor = (s: Pick<Settings, 'auto_lunch_enabled'>) =>
  s.auto_lunch_enabled ? LUNCH_LABEL : PUNCH_LABEL

/** Punch marker: one color-coded state per punch */
export type PunchMark = 'assumed' | 'edited' | null
export function punchMark(p: Punch): PunchMark {
  if (p.is_assumed) return 'assumed'
  if (p.edited_at || p.source === 'manual') return 'edited'
  return null
}

/** Minutes on break per day, from lunch_out to the next lunch_in */
export function breakMinutes(punches: Punch[]): number {
  let total = 0
  let start: number | null = null
  for (const p of punches) {
    if (p.punch_type === 'lunch_out') start = new Date(p.punched_at).getTime()
    else if (p.punch_type === 'lunch_in' && start !== null) {
      total += (new Date(p.punched_at).getTime() - start) / 60_000
      start = null
    }
  }
  return Math.round(total)
}

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`)
