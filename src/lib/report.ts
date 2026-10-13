/* Weekly hours report: punches per day plus regular / OT totals. No pay amounts.
   jsPDF is loaded on demand so it never slows down normal app use. */
import type { DayPay, Period } from './pay'
import { datesBetween } from './pay'
import { fmtDay, fmtHours, fmtTime, weekStartOf } from './time'
import { breakMinutes, fmtMinutes, labelsFor, type DayHours, type Punch, type PunchType, type Settings } from './types'

interface ReportInput {
  s: Settings
  period: Period
  punches: Punch[]
  days: DayHours[]
  pay: Map<string, DayPay>
}

const hm = (h: number) => fmtHours(h)
const dec = (h: number) => h.toFixed(2)
const both = (h: number) => `${hm(h)}  (${dec(h)})`

function timesOf(punches: Punch[], type: PunchType, tz: string) {
  const t = punches.filter((p) => p.punch_type === type).map((p) => fmtTime(p.punched_at, tz))
  return t.length ? t.join('\n') : ''
}

export async function buildReport({ s, period, punches, days, pay }: ReportInput): Promise<File> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const tz = s.timezone
  const L = labelsFor(s)
  const breakWord = s.auto_lunch_enabled ? 'Lunch' : 'Break'
  const W = doc.internal.pageSize.getWidth()
  const M = 48

  // Header
  doc.setFont('helvetica', 'bold').setFontSize(18).text(s.display_name || 'Hours Report', M, 60)
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(90)
  doc.text('Weekly Hours', W - M, 60, { align: 'right' })
  const label = s.pay_frequency === 'weekly' ? 'Work week' : 'Pay period'
  doc.setTextColor(30)
  doc.text(`${label}: ${fmtDay(period.start, { weekday: 'short', month: 'short', day: 'numeric' })} to ${fmtDay(period.end, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`, M, 82)
  doc.text(`Payday: ${fmtDay(period.payDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`, M, 98)

  // One table per workweek (one for weekly pay; two for biweekly)
  const dates = datesBetween(period.start, period.end)
  const weeks = new Map<string, string[]>()
  for (const d of dates) {
    const wk = weekStartOf(d, s.week_start_dow)
    if (!weeks.has(wk)) weeks.set(wk, [])
    weeks.get(wk)!.push(d)
  }

  let y = 118
  const grand = { reg: 0, ot: 0, dt: 0, hol: 0, hours: 0 }

  for (const [, wkDates] of weeks) {
    const sub = { reg: 0, ot: 0, dt: 0, hol: 0, hours: 0 }
    const body = wkDates.map((date) => {
      const ps = punches.filter((p) => p.work_date === date)
      const info = days.find((d) => d.work_date === date)
      const dp = pay.get(date)
      if (dp) { sub.reg += dp.reg; sub.ot += dp.ot; sub.dt += dp.dt; sub.hol += dp.hol; sub.hours += dp.hours }
      const tags = [info?.is_extra_day ? 'Extra day' : '', info?.is_holiday ? 'Holiday' : ''].filter(Boolean).join(', ')
      const dayCell = fmtDay(date) + (tags ? `\n${tags}` : '')
      if (ps.length === 0) return [dayCell, 'Off', '', '', '', '', '0h 00m']
      const mins = breakMinutes(ps)
      const brk = info?.auto_lunch_applied ? `${s.assumed_lunch_minutes}m` : mins ? fmtMinutes(mins) : ''
      return [
        dayCell,
        timesOf(ps, 'clock_in', tz),
        timesOf(ps, 'lunch_out', tz),
        timesOf(ps, 'lunch_in', tz),
        timesOf(ps, 'clock_out', tz),
        brk,
        hm(Number(info?.net_hours ?? 0)),
      ]
    })

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Day', L.clock_in, L.lunch_out, L.lunch_in, L.clock_out, breakWord, 'Total']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 5, valign: 'middle', textColor: 30, lineColor: 200 },
      headStyles: { fillColor: [8, 16, 16], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 92 }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1 && d.cell.raw === 'Off') d.cell.styles.textColor = 140
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

    const rows: [string, string][] = [['Regular', both(sub.reg)], ['Overtime', both(sub.ot)]]
    if (sub.dt > 0) rows.push(['Double time', both(sub.dt)])
    if (sub.hol > 0) rows.push(['Holiday', both(sub.hol)])
    rows.push([weeks.size > 1 ? `Week of ${fmtDay(wkDates[0], { month: 'short', day: 'numeric' })}` : 'Total', both(sub.hours)])
    autoTable(doc, {
      startY: y,
      margin: { left: W - M - 230, right: M },
      body: rows,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: 30 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right', fontStyle: 'bold' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
    for (const k of Object.keys(grand) as (keyof typeof grand)[]) grand[k] += sub[k]
  }

  if (weeks.size > 1) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30)
    doc.text(`Pay period total: ${both(grand.hours)}`, W - M, y, { align: 'right' })
    doc.setFont('helvetica', 'normal').setFontSize(10)
    doc.text(`Regular ${both(grand.reg)}   Overtime ${both(grand.ot)}`, W - M, y + 16, { align: 'right' })
  }

  // Footer
  const H = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140)
  doc.text(`Generated ${fmtDay(new Date().toISOString().slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })} with Timetrack, powered by Leading Zero LLC`, W / 2, H - 28, { align: 'center' })

  const last = (s.display_name || 'Hours').trim().split(/\s+/).at(-1)!.replace(/[^A-Za-z0-9-]/g, '')
  const name = `${last}_Hours_${s.pay_frequency === 'weekly' ? 'WE' : 'PE'}_${period.end}.pdf`
  return new File([doc.output('blob')], name, { type: 'application/pdf' })
}

/** Phone share sheet when available, download otherwise. */
export async function shareOrDownload(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text: title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url; a.download = file.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
