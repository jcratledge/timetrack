import { useState } from 'react'
import { Card, btn } from '../components/ui'
import {
  BreaksSection, MissingSection, OvertimeSection, PayRateSection, PayScheduleSection, ScheduleSection, TimeSection,
  type SetFn,
} from '../components/sections'
import { AccountCard } from '../components/Account'
import About from './About'
import { useSettings, useUpdateSettings } from '../lib/queries'
import { deviceTimezone } from '../lib/time'
import type { Settings } from '../lib/types'

const STEPS = ['Pay', 'Pay schedule', 'Your shifts', 'Overtime'] as const

/** First-launch setup: a few questions, then straight to the clock. */
export default function Setup() {
  const saved = useSettings().data!
  const save = useUpdateSettings()
  // Start with a blank rate so nobody inherits a default wage by accident
  const [s, setS] = useState<Settings>(() => ({ ...saved, timezone: deviceTimezone(), regular_rate: NaN }))
  const [step, setStep] = useState(0)
  const [intro, setIntro] = useState(true)
  const set: SetFn = (k, v) => setS((p) => ({ ...p, [k]: v }))

  const canNext = step !== 0 || Number(s.regular_rate) > 0
  if (intro) return <About onStart={() => { setIntro(false); window.scrollTo(0, 0) }} />
  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center gap-3">
        <img src="/icons/icon-512.png" alt="" className="h-10 w-10" />
        <div>
          <p className="font-display text-sm tracking-[0.2em] text-fog">TIMETRACK</p>
          <p className="text-xs text-mist">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {STEPS.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-cyan' : 'bg-line'}`} />)}
      </div>

      <div className="mt-5 flex-1 space-y-4">
        {step === 0 && (
          <>
            <Card>
              <p className="mb-3 text-sm text-fog">Track your shifts and see what your paycheck should be. A few quick questions first.</p>
              <PayRateSection s={s} set={set} />
            </Card>
            <Card><TimeSection s={s} set={set} /></Card>
            <AccountCard startWithSignIn intro="Already use Timetrack on another phone? Sign in to bring everything over." />
          </>
        )}
        {step === 1 && <Card><PayScheduleSection s={s} set={set} /></Card>}
        {step === 2 && (
          <>
            <Card><ScheduleSection s={s} set={set} /></Card>
            <Card><BreaksSection s={s} set={set} /></Card>
            <Card><MissingSection s={s} set={set} /></Card>
          </>
        )}
        {step === 3 && (
          <Card>
            <OvertimeSection s={s} set={set} />
            <p className="mt-4 text-xs text-mist">Not sure? The defaults follow federal rules. You can change any of this later in Settings.</p>
          </Card>
        )}
      </div>

      {save.error && <p className="mt-3 text-sm text-danger">{save.error.message}</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button className={btn.ghost} disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {last ? (
          <button className={`${btn.primary} glow`} disabled={save.isPending}
            onClick={() => save.mutate({ ...s, setup_completed: true })}>
            {save.isPending ? 'Saving…' : 'Start tracking'}
          </button>
        ) : (
          <button className={btn.primary} disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
        )}
      </div>
    </div>
  )
}
