import type { ReactNode } from 'react'
import type { PunchMark } from '../lib/types'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel/70 p-4 backdrop-blur ${className}`}>
      {children}
    </section>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="font-display text-[10px] tracking-[0.18em] text-mist uppercase">{children}</p>
}

export function ExtraBadge({ children = 'Extra day' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold ring-1 ring-gold/40">
      ★ {children}
    </span>
  )
}

export function HolidayBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose/15 px-2 py-0.5 text-[11px] font-semibold text-rose ring-1 ring-rose/40">
      ◆ Holiday
    </span>
  )
}

/* Color-coded punch state: amber = assumed (filled in for you), violet = edited by you */
export const MARK_TEXT: Record<Exclude<PunchMark, null>, string> = {
  assumed: 'text-amber',
  edited: 'text-violet',
}
export const MARK_BG: Record<Exclude<PunchMark, null>, string> = {
  assumed: 'bg-amber',
  edited: 'bg-violet',
}

export function MarkDot({ mark }: { mark: PunchMark }) {
  if (!mark) return <span className="inline-block h-2 w-2" />
  return <span aria-label={mark} className={`inline-block h-2 w-2 rounded-full ${MARK_BG[mark]}`} />
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-mist">
      <span className="flex items-center gap-1.5"><MarkDot mark="assumed" /> Assumed</span>
      <span className="flex items-center gap-1.5"><MarkDot mark="edited" /> Edited</span>
      <span className="text-gold">★ Extra day</span>
      <span className="text-rose">◆ Holiday</span>
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-ink-2 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <h2 className="mb-4 font-display text-xs tracking-[0.18em] text-fog uppercase">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="mt-3 flex w-full items-center justify-between gap-3 text-left">
      <span>
        <span className="block text-sm text-fog">{label}</span>
        {hint && <span className="block text-xs text-mist">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-cyan' : 'bg-line'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-fog transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          className={`h-11 rounded-xl border px-1 text-sm ${
            value === o.value ? 'border-cyan bg-cyan/15 text-cyan' : 'border-line text-mist'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const btn = {
  primary: 'h-12 w-full rounded-xl bg-cyan font-semibold text-ink active:scale-[0.98] disabled:opacity-50',
  ghost: 'h-12 w-full rounded-xl border border-line font-semibold text-fog active:scale-[0.98] disabled:opacity-50',
  danger: 'h-12 w-full rounded-xl border border-danger/50 font-semibold text-danger active:scale-[0.98]',
}

export const field =
  'h-12 w-full rounded-xl border border-line bg-ink px-3 text-base text-fog outline-none focus:border-cyan'
