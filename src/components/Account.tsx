import { useState } from 'react'
import { Card, Label, btn, field } from './ui'
import { supabase } from '../lib/supabase'
import { prepareMerge, useSession } from '../lib/session'

type Step = 'idle' | 'code-link' | 'code-signin' | 'done'

/** Email recovery. Anonymous users can link an email (or, if that email
    already has an account, sign into it and bring their punches along).
    Works with the emailed link or the emailed code (needed for iPhone home-screen apps). */
export function AccountCard({ intro, startWithSignIn = false }: { intro?: string; startWithSignIn?: boolean }) {
  const { user } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isAnon = !!user?.is_anonymous
  const redirect = window.location.origin

  async function sendSignIn() {
    if (isAnon) await prepareMerge()
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: redirect },
    })
    if (error) { setMsg(/signups not allowed|not found/i.test(error.message) ? 'No account uses that email yet. Use "Secure my data" instead.' : error.message); return }
    setStep('code-signin')
    setMsg('Check your email. Tap the link, or enter the code here.')
  }

  async function link() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect })
    if (error && (error.code === 'email_exists' || /already/i.test(error.message))) {
      // Email belongs to an existing account (maybe from another LZ app): sign in and merge.
      await sendSignIn()
      setMsg('That email already has an account. Check your email to sign in; your punches here will move into it.')
    } else if (error) {
      setMsg(error.message)
    } else {
      setStep('code-link')
      setMsg('Check your email. Tap the confirm link, or enter the code here.')
    }
    setBusy(false)
  }

  async function signIn() {
    setBusy(true); setMsg(null)
    await sendSignIn()
    setBusy(false)
  }

  async function verify() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.verifyOtp({
      email, token: code.trim(), type: step === 'code-link' ? 'email_change' : 'email',
    })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setStep('done'); setMsg('You are all set.')
  }

  if (user && !isAnon) {
    return (
      <Card>
        <Label>Account</Label>
        <p className="mt-3 text-sm text-fog">Signed in as <strong>{user.email}</strong>. Use this email to sign in on any phone.</p>
      </Card>
    )
  }

  const awaitingCode = step === 'code-link' || step === 'code-signin'

  return (
    <Card>
      <Label>Account recovery</Label>
      <p className="mt-3 text-sm text-mist">
        {intro ?? 'Your data is tied to this phone until you add an email. Add one so a new phone or cleared browser never loses it.'}
      </p>

      {!awaitingCode && (
        <>
          <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} className={`${field} mt-3`} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {startWithSignIn ? (
              <button className={`${btn.primary} col-span-2`} disabled={busy || !email} onClick={signIn}>Send sign-in code</button>
            ) : (
              <>
                <button className={btn.primary} disabled={busy || !email} onClick={link}>Secure my data</button>
                <button className={btn.ghost} disabled={busy || !email} onClick={signIn}>I have an account</button>
              </>
            )}
          </div>
        </>
      )}

      {awaitingCode && (
        <>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="Code from email" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${field} mt-3 font-mono tracking-[0.3em]`} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className={btn.primary} disabled={busy || code.length < 6} onClick={verify}>Verify</button>
            <button className={btn.ghost} disabled={busy} onClick={() => { setStep('idle'); setCode(''); setMsg(null) }}>Back</button>
          </div>
        </>
      )}

      {msg && <p className="mt-3 text-sm text-mist">{msg}</p>}
    </Card>
  )
}
