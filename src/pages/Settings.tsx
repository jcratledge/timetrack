import { useEffect, useState } from 'react'
import { Card, btn } from '../components/ui'
import {
  BreaksSection, MissingSection, OvertimeSection, PayRateSection, PayScheduleSection, ScheduleSection, TimeSection,
  type SetFn,
} from '../components/sections'
import { AccountCard } from '../components/Account'
import { useSettings, useUpdateSettings } from '../lib/queries'
import type { Settings } from '../lib/types'

export default function SettingsPage() {
  const saved = useSettings().data!
  const save = useUpdateSettings()
  const [s, setS] = useState<Settings>(saved)
  useEffect(() => setS(saved), [saved])

  const set: SetFn = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const valid = Number(s.regular_rate) > 0 && Number.isFinite(Number(s.tax_rate))

  return (
    <div className="space-y-4">
      <Card><PayRateSection s={s} set={set} /></Card>
      <Card><PayScheduleSection s={s} set={set} /></Card>
      <Card><OvertimeSection s={s} set={set} /></Card>
      <Card><ScheduleSection s={s} set={set} /></Card>
      <Card><BreaksSection s={s} set={set} /></Card>
      <Card><MissingSection s={s} set={set} /></Card>
      <Card><TimeSection s={s} set={set} /></Card>

      {(dirty || save.error) && (
        <div className="sticky bottom-24 z-10">
          {save.error && <p className="mb-2 rounded-xl bg-ink p-2 text-sm text-danger">{save.error.message}</p>}
          <button className={`${btn.primary} glow`} disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(s)}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <AccountCard />

      <footer className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
        <img src="/brand/lz.png" alt="" className="h-8 w-8 opacity-80" />
        <p className="font-display text-[10px] tracking-[0.2em] text-mist uppercase">Powered by Leading Zero LLC</p>
        <a href="/about" className="text-xs text-cyan">About Timetrack</a>
      </footer>
    </div>
  )
}
