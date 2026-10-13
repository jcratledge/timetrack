import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useSession } from './session'
import type { DayHours, Punch, PunchType, Settings } from './types'

const PUNCH_COLS =
  'id, punched_at, work_date, punch_type, source, is_assumed, assumption_notes, original_punched_at, edited_at'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

/* ---------------- Reads ---------------- */

export function useSettings() {
  const { ready } = useSession()
  return useQuery({
    queryKey: ['settings'],
    enabled: ready,
    queryFn: async () => unwrap<Settings>(await supabase.from('user_settings').select('*').single()),
    staleTime: 5 * 60_000,
  })
}

export interface RangeData {
  punches: Punch[]
  days: DayHours[]
}

/** Punches and daily hours for an inclusive date range. */
export function useRange(from: string, to: string) {
  return useQuery({
    queryKey: ['range', from, to],
    queryFn: async (): Promise<RangeData> => {
      const [p, d] = await Promise.all([
        supabase.from('time_entries').select(PUNCH_COLS)
          .gte('work_date', from).lte('work_date', to)
          .is('deleted_at', null).order('punched_at'),
        supabase.from('v_daily_hours')
          .select('work_date, week_start, is_complete, has_assumed_punch, auto_lunch_applied, is_extra_day, is_holiday, raw_hours, net_hours')
          .gte('work_date', from).lte('work_date', to).order('work_date'),
      ])
      return { punches: unwrap(p), days: unwrap(d) }
    },
    refetchInterval: 60_000,
  })
}

export function useSeedAvailable() {
  return useQuery({
    queryKey: ['seed'],
    queryFn: async () => unwrap<number>(await supabase.rpc('seed_available')),
    staleTime: Infinity,
  })
}

/* ---------------- Writes ---------------- */

function useInvalidateRanges() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['range'] })
}

export function useRecordPunch() {
  const invalidate = useInvalidateRanges()
  return useMutation({
    mutationFn: async (type: PunchType) =>
      unwrap<Punch>(await supabase.rpc('record_punch', { p_type: type })),
    onSettled: invalidate,
  })
}

export function useUpdatePunch() {
  const invalidate = useInvalidateRanges()
  return useMutation({
    mutationFn: async ({ id, punched_at }: { id: string; punched_at: string }) =>
      unwrap(await supabase.from('time_entries').update({ punched_at }).eq('id', id).select().single()),
    onSettled: invalidate,
  })
}

export function useAddPunch() {
  const invalidate = useInvalidateRanges()
  return useMutation({
    mutationFn: async ({ punch_type, punched_at }: { punch_type: PunchType; punched_at: string }) =>
      unwrap(await supabase.from('time_entries')
        .insert({ punch_type, punched_at, source: 'manual' }).select().single()),
    onSettled: invalidate,
  })
}

export function useDeletePunch() {
  const invalidate = useInvalidateRanges()
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await supabase.from('time_entries')
        .update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single()),
    onSettled: invalidate,
  })
}

export function useSetHoliday() {
  const invalidate = useInvalidateRanges()
  return useMutation({
    mutationFn: async ({ work_date, is_holiday }: { work_date: string; is_holiday: boolean }) => {
      const { data: u } = await supabase.auth.getUser()
      return unwrap(await supabase.from('day_overrides')
        .upsert({ user_id: u.user!.id, work_date, is_holiday, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,work_date' })
        .select().single())
    },
    onSettled: invalidate,
  })
}

/** Fields the client may write. Server-owned fields (last_swept_date, user_id) are excluded. */
const WRITABLE: (keyof Settings)[] = [
  'display_name', 'timezone', 'setup_completed',
  'regular_rate', 'tax_rate', 'overtime_threshold_hours', 'ot_multiplier',
  'daily_ot_enabled', 'daily_ot_after', 'daily_dt_enabled', 'daily_dt_after', 'dt_multiplier', 'holiday_multiplier', 'holiday_counts_toward_ot',
  'pay_frequency', 'pay_period_anchor', 'payday_offset_days', 'week_start_dow', 'day_start_hour',
  'schedule_enabled', 'weekly_days', 'biweekly_days', 'biweekly_anchor_week',
  'auto_lunch_enabled', 'assumed_lunch_minutes', 'auto_lunch_min_shift_hours',
  'missing_punch_mode', 'sweep_time', 'assumed_clock_in', 'assumed_clock_out',
]

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<Settings>) => {
      const patch: Record<string, unknown> = {}
      for (const k of WRITABLE) if (k in s) patch[k] = s[k]
      const { data: u } = await supabase.auth.getUser()
      return unwrap<Settings>(await supabase.from('user_settings').update(patch)
        .eq('user_id', u.user!.id).select().single())
    },
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s)
      qc.invalidateQueries({ queryKey: ['range'] })
    },
  })
}

export function useClaimSeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap<number>(await supabase.rpc('claim_seed')),
    onSuccess: () => {
      qc.setQueryData(['seed'], 0)
      qc.invalidateQueries({ queryKey: ['range'] })
    },
  })
}

/* ---------------- Derived ---------------- */

/** What the big button should do next, given today's punches. */
export function nextPunch(today: Punch[]): PunchType {
  switch (today.at(-1)?.punch_type) {
    case 'clock_in': return 'lunch_out'
    case 'lunch_out': return 'lunch_in'
    case 'lunch_in': return 'clock_out'
    default: return 'clock_in'
  }
}
