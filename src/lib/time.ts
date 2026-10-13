/* Timezone helpers. All wall-clock math happens in the user's configured tz,
   never the device tz, so a phone set to another zone can't skew punches. */

function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute'), s: g('second') }
}

function offsetMs(d: Date, tz: string) {
  const p = parts(d, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000
}

/** "2026-10-12" + "05:50" in tz -> Date */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const o1 = offsetMs(new Date(guess), tz)
  let utc = guess - o1
  const o2 = offsetMs(new Date(utc), tz)
  if (o2 !== o1) utc = guess - o2
  return new Date(utc)
}

export function localDate(d: Date, tz: string): string {
  const p = parts(d, tz)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/** The work date "now" belongs to, honoring the overnight day boundary. */
export function workToday(now: Date, tz: string, dayStartHour: number): string {
  return localDate(new Date(now.getTime() - dayStartHour * 3_600_000), tz)
}

/** A wall-clock time entered for a work date. Times before the boundary
    (e.g. 1:00 AM with a 4 AM boundary) land on the next calendar day. */
export function workTimeToUtc(workDate: string, time: string, tz: string, dayStartHour: number): Date {
  const [h, m] = time.split(':').map(Number)
  const cal = h * 60 + m < dayStartHour * 60 ? addDays(workDate, 1) : workDate
  return zonedToUtc(cal, time, tz)
}

/** "HH:MM" for <input type="time"> */
export function localHHMM(iso: string, tz: string): string {
  const p = parts(new Date(iso), tz)
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(a) - t(b)) / 86_400_000)
}

/** ISO weekday 1 = Mon ... 7 = Sun */
export function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** First day of the workweek containing date. */
export function weekStartOf(date: string, weekStartDow = 1): string {
  return addDays(date, -((isoDow(date) - weekStartDow + 7) % 7))
}

/** The Monday that falls inside the workweek containing date (used as a stable anchor). */
export function mondayInWeek(date: string, weekStartDow: number): string {
  const ws = weekStartOf(date, weekStartDow)
  return addDays(ws, (1 - weekStartDow + 7) % 7)
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

export function fmtDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export const fmtHours = (h: number) => {
  const total = Math.round(h * 60)
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`
}

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function deviceTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver' } catch { return 'America/Denver' }
}
