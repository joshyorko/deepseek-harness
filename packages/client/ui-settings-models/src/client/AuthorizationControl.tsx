/** Provider-native authorization control for one Models editor card. */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AuthorizationAttemptView, AuthorizationEntryView, IApiClient,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { en } from './locales.ts'
import { messageOf } from './store.ts'
import styles from './ModelsSection.module.css'

/** Fixed UI cadence for observing a provider-owned browser callback. */
const AUTHORIZATION_STATUS_POLL_MS = 250

/** Props of {@link AuthorizationControl}. */
export interface AuthorizationControlProps {
  entry: AuthorizationEntryView
  api: Pick<IApiClient, 'authorization'>
  t: (key: keyof typeof en) => string
  disabled: boolean
  /** Commit the provider profile after the grant lands; return a visible failure. */
  onAuthorized: () => Promise<string | undefined>
  /** Refresh the surrounding page after sign-out. */
  onSignedOut: () => void
}

/** Provider-native sign-in/sign-out control with provider notices and prompts. */
export function AuthorizationControl(props: AuthorizationControlProps): ReactNode {
  const [attempt, setAttempt] = useState<AuthorizationAttemptView | undefined>(undefined)
  const [answer, setAnswer] = useState('')
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    alive.current = false
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])

  const isAlive = (): boolean => alive.current

  const settle = async (next: AuthorizationAttemptView): Promise<void> => {
    if (!isAlive()) return
    setAttempt(next)
    if (next.state === 'authorized') {
      const applyFailure = await props.onAuthorized()
      if (!isAlive()) return
      if (applyFailure !== undefined) {
        setFailure(applyFailure)
        setBusy(false)
      }
      return
    }
    if (next.state === 'failed') {
      setFailure(next.error ?? props.t('signInFailed'))
      setBusy(false)
      return
    }
    if (next.state === 'cancelled') {
      setAttempt(undefined)
      setBusy(false)
      return
    }
    if (next.prompt?.kind === 'select' && answer.length === 0) {
      setAnswer(next.prompt.options[0]?.id ?? '')
    }
    setBusy(false)
    timer.current = setTimeout(() => { void refresh(next) }, AUTHORIZATION_STATUS_POLL_MS)
  }

  const refresh = async (current: AuthorizationAttemptView): Promise<void> => {
    try {
      const response = await props.api.authorization.status({
        key: props.entry.key, attemptId: current.attemptId,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await settle(response.result.value.attempt)
    } catch (error) {
      if (!alive.current) return
      setFailure(messageOf(error))
      setBusy(false)
    }
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const method = props.entry.methods[0]
      const response = await props.api.authorization.start({
        key: props.entry.key,
        ...method === undefined ? {} : { method: method.id },
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await settle(response.result.value.attempt)
    } catch (error) {
      if (!alive.current) return
      setFailure(messageOf(error))
      setBusy(false)
    }
  }

  const respond = async (): Promise<void> => {
    const prompt = attempt?.prompt
    if (attempt === undefined || prompt === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const response = await props.api.authorization.respond({
        key: props.entry.key,
        attemptId: attempt.attemptId,
        promptId: prompt.id,
        value: answer,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await refresh(attempt)
    } catch (error) {
      if (!alive.current) return
      setFailure(messageOf(error))
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (attempt === undefined) return
    setBusy(true)
    try {
      const response = await props.api.authorization.cancel({
        key: props.entry.key, attemptId: attempt.attemptId,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      setAttempt(undefined)
      setFailure(undefined)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const signOut = async (): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const response = await props.api.authorization.signOut({ key: props.entry.key })
      if (!response.result.ok) throw new Error(response.result.error.message)
      props.onSignedOut()
    } catch (error) {
      if (!alive.current) return
      setFailure(messageOf(error))
      setBusy(false)
    }
  }

  if (props.entry.configured && attempt === undefined) {
    return (
      <div className={styles['authorization']}>
        <p className={styles['authorizationStatus']}>{props.t('signedIn')}</p>
        <button
          type="button" className={styles['secondaryButton']}
          disabled={props.disabled || busy || !props.entry.writable}
          onClick={() => { void signOut() }}
        >
          {busy ? props.t('signingOut') : props.t('signOut')}
        </button>
        {failure === undefined ? null : <p className={styles['error']}>{failure}</p>}
      </div>
    )
  }

  if (attempt === undefined) {
    return (
      <div className={styles['authorization']}>
        <button
          type="button" className={styles['primaryButton']}
          disabled={props.disabled || busy || props.entry.inFlight || !props.entry.writable}
          onClick={() => { void start() }}
        >
          {busy ? props.t('signingIn') : props.t('signIn')}
        </button>
        {failure === undefined ? null : <p className={styles['error']}>{failure}</p>}
      </div>
    )
  }

  const prompt = attempt.prompt
  return (
    <div className={styles['authorization']}>
      {attempt.notices.map((notice, index) => (
        <div key={`${String(index)}:${notice.message}`} className={styles['authorizationNotice']}>
          <p>{notice.message}</p>
          {notice.url === undefined
            ? null
            : <a href={notice.url} target="_blank" rel="noreferrer">{props.t('openSignInPage')}</a>}
          {notice.code === undefined ? null : <code>{notice.code}</code>}
        </div>
      ))}
      {prompt === undefined
        ? <p className={styles['authorizationStatus']}>{props.t('waitingForSignIn')}</p>
        : (
          <div className={styles['field']}>
            <span className={styles['fieldLabel']}>{prompt.message}</span>
            {prompt.kind === 'select'
              ? (
                <select
                  className={`${styles['input']} ${styles['selectInput']}`}
                  aria-label={prompt.message}
                  value={answer}
                  disabled={busy}
                  onChange={(event) => { setAnswer(event.target.value) }}
                >
                  {prompt.options.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              )
              : (
                <input
                  className={styles['input']}
                  type={prompt.kind === 'secret' ? 'password' : 'text'}
                  aria-label={prompt.message}
                  placeholder={prompt.placeholder}
                  value={answer}
                  disabled={busy}
                  onChange={(event) => { setAnswer(event.target.value) }}
                />
              )}
            <button
              type="button" className={styles['primaryButton']}
              disabled={busy || answer.length === 0}
              onClick={() => { void respond() }}
            >
              {props.t('continueSignIn')}
            </button>
          </div>
        )}
      <button
        type="button" className={styles['secondaryButton']}
        disabled={busy}
        onClick={() => { void cancel() }}
      >
        {props.t('cancelSignIn')}
      </button>
      {failure === undefined ? null : <p className={styles['error']}>{failure}</p>}
    </div>
  )
}
