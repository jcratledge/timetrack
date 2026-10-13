import type { ReactNode } from 'react'
import { Card, Label, btn } from '../components/ui'

const REPO = 'https://github.com/jcratledge/timetrack'

const FEATURES: [string, string][] = [
  ['One-tap punching', 'A single button that knows what is next: clock in, break, back, clock out.'],
  ['Live pay estimate', 'Hours, overtime, gross and take-home update as you work.'],
  ['Your pay rules', 'Weekly, every two weeks, or 1st and 15th. Weekly and daily overtime, double time, holidays.'],
  ['Forgot to punch?', 'Missing punches are flagged for you, or filled in with your usual times. Your choice.'],
  ['Fix anything', 'Edit, add, or remove any punch. Edited and filled-in punches are color coded.'],
  ['Hours report', 'Send a clean PDF of the week to your supervisor from your phone.'],
]

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan/60 font-mono text-xs text-cyan">{n}</span>
      <span className="pt-1 text-sm text-fog">{children}</span>
    </li>
  )
}

/** Public info page: shown at /about and to new users before setup. */
export default function About({ onStart }: { onStart?: () => void }) {
  const start = onStart ?? (() => { window.location.href = '/' })

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <div className="flex flex-col items-center pt-4 text-center">
        <img src="/icons/icon-512.png" alt="" className="h-24 w-24 rounded-3xl" />
        <h1 className="mt-5 font-display text-xl tracking-[0.25em] text-fog text-glow">TIMETRACK</h1>
        <p className="mt-3 text-base text-fog">Your own time clock.</p>
        <p className="mt-1 text-sm text-mist">Know your hours and your paycheck before payday.</p>
        <button className={`${btn.primary} glow mt-6`} onClick={start}>Get started, it's free</button>
        <p className="mt-2 text-xs text-mist">No password. No ads. Works on any phone.</p>
      </div>

      <Card>
        <Label>What it does</Label>
        <ul className="mt-3 space-y-3">
          {FEATURES.map(([title, body]) => (
            <li key={title}>
              <p className="text-sm font-semibold text-fog">{title}</p>
              <p className="text-sm text-mist">{body}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <Label>How it works</Label>
        <ol className="mt-3 space-y-3">
          <Step n={1}>Answer a few questions about your pay and schedule. About a minute.</Step>
          <Step n={2}>Tap the big button when you start, take a break, and leave.</Step>
          <Step n={3}>Check your totals anytime, and send a weekly report when you are asked to confirm hours.</Step>
        </ol>
      </Card>

      <Card>
        <Label>Put it on your home screen</Label>
        <p className="mt-3 text-sm text-fog"><strong>Android:</strong> <span className="text-mist">open in Chrome, then tap Install app.</span></p>
        <p className="mt-2 text-sm text-fog"><strong>iPhone:</strong> <span className="text-mist">open in Safari, tap Share, then Add to Home Screen.</span></p>
      </Card>

      <Card>
        <Label>Your data</Label>
        <p className="mt-3 text-sm text-mist">
          Your punches are private to your account. Nobody else, including other Timetrack users, can see them.
          Add an email in Settings to keep your history if you change phones.
        </p>
        <p className="mt-2 text-sm text-mist">
          Pay figures are estimates to help you plan. Your employer's payroll is the official record.
        </p>
      </Card>

      <footer className="flex flex-col items-center gap-2 pt-2 text-center">
        <img src="/brand/lz.png" alt="" className="h-8 w-8 opacity-80" />
        <p className="font-display text-[10px] tracking-[0.2em] text-mist uppercase">Powered by Leading Zero LLC</p>
        <a href={REPO} className="text-xs text-cyan" target="_blank" rel="noreferrer">Open source on GitHub</a>
      </footer>
    </div>
  )
}
