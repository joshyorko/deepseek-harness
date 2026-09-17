import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AuthorizationAttemptView, AuthorizationFlowView } from '../types.ts'
import type { AuthorizationLocaleKey } from './locales.ts'
import type { ClientAuthorizationRemote, ClientSettingsRemote } from './remote.ts'
import { remoteValue } from './remote.ts'

const STATUS_POLL_MS = 500

/** Props injected beside the Models card's owner-provided route facts. */
export interface AuthorizationCardProps extends ProviderCardExtrasOwnerProps {
  remote: ClientAuthorizationRemote
  settings: ClientSettingsRemote
  t: (key: AuthorizationLocaleKey) => string
}

/** Read one path without interpreting provider-owned values. */
function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Provider-native authorization controls contributed to one Models card. */
export function AuthorizationCard(props: AuthorizationCardProps): ReactNode {
  const [flow, setFlow] = useState<AuthorizationFlowView | undefined>()
  const [attempt, setAttempt] = useState<AuthorizationAttemptView | undefined>()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const alive = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>()
  const flowKey = `${props.provider.settingsNs}/${props.provider.provider}`

  const clearTimer = (): void => {
    if (timer.current === undefined) return
    clearTimeout(timer.current)
    timer.current = undefined
  }

  const loadFlow = async (): Promise<AuthorizationFlowView | undefined> => {
    const rows = remoteValue(await props.remote.list())
    const next = rows.find(row => row.key === flowKey)
    if (alive.current) setFlow(next)
    return next
  }

  const materializeProfile = async (): Promise<void> => {
    if (props.configured) return
    const description = remoteValue(await props.settings.describe())
    if (!description.writable) throw new Error(props.t('readOnly'))
    const namespace = description.namespaces.find(row => row.ns === props.provider.settingsNs)
    if (namespace === undefined) throw new Error(props.t('profileFailed'))
    if (valueAtPath(namespace.value, props.provider.settingsPath) !== undefined) return
    const result = await props.settings.mutate(
      namespace.ns,
      [{ op: 'set', path: [...props.provider.settingsPath], value: {} }],
      namespace.revision,
    )
    if (!result.ok) {
      throw new Error(result.error.code === 'settings/conflict' ? props.t('conflict') : result.error.message)
    }
  }

  const settle = async (next: AuthorizationAttemptView): Promise<void> => {
    if (!alive.current) return
    clearTimer()
    setAttempt(next)
    if (next.state === 'authorized') {
      try {
        await materializeProfile()
        if (!alive.current) return
        setNotice(props.t('profileSaved'))
        await loadFlow()
      } catch (error) {
        if (!alive.current) return
        setFailure(error instanceof Error ? error.message : props.t('profileFailed'))
      } finally {
        if (alive.current) setBusy(false)
      }
      return
    }
    if (next.state === 'failed') {
      setFailure(next.error?.message ?? props.t('failed'))
      setBusy(false)
      return
    }
    if (next.state === 'cancelled') {
      setNotice(props.t('cancelled'))
      setBusy(false)
      return
    }
    if (next.prompt?.kind === 'select' && answer.length === 0) {
      setAnswer(next.prompt.options[0]?.id ?? '')
    }
    setBusy(false)
    timer.current = setTimeout(() => { void refresh(next) }, STATUS_POLL_MS)
  }

  const refresh = async (current: AuthorizationAttemptView): Promise<void> => {
    try {
      await settle(remoteValue(await props.remote.status(current.key, current.attemptId)))
    } catch {
      if (!alive.current) return
      setFailure(props.t('statusFailed'))
      setBusy(false)
    }
  }

  const start = async (method: string): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    setNotice(undefined)
    try {
      await settle(remoteValue(await props.remote.start(flowKey, method)).status)
    } catch {
      if (!alive.current) return
      setFailure(props.t('startFailed'))
      setBusy(false)
    }
  }

  const respond = async (): Promise<void> => {
    if (attempt?.prompt === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const next = remoteValue(await props.remote.respond(
        attempt.key,
        attempt.attemptId,
        attempt.prompt.id,
        answer,
      ))
      setAnswer('')
      await settle(next)
    } catch {
      if (!alive.current) return
      setFailure(props.t('responseFailed'))
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (attempt === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      await settle(remoteValue(await props.remote.cancel(attempt.key, attempt.attemptId)))
    } catch {
      if (!alive.current) return
      setFailure(props.t('cancelFailed'))
      setBusy(false)
    }
  }

  const signOut = async (): Promise<void> => {
    if (flow === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      remoteValue(await props.remote.signOut(flow.key))
      setAttempt(undefined)
      setNotice(undefined)
      await loadFlow()
    } catch {
      if (!alive.current) return
      setFailure(props.t('signOutFailed'))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  useEffect(() => {
    alive.current = true
    void loadFlow().catch(() => { if (alive.current) setFailure(props.t('unavailable')) })
    return () => {
      alive.current = false
      clearTimer()
    }
  }, [flowKey, props.remote])

  if (props.keyConfigured || flow === undefined) return null
  const active = attempt?.state === 'running' || attempt?.state === 'prompt'
  return (
    <div role="group" aria-label={flow.label}>
      {flow.configured && attempt === undefined ? <p role="status">{props.t('signedIn')}</p> : null}
      {attempt?.notices.map((item, index) => (
        <div key={`${String(index)}:${item.message}`}>
          <p>{item.message}</p>
          {item.url === undefined ? null : <a href={item.url} target="_blank" rel="noreferrer">{props.t('open')}</a>}
          {item.code === undefined ? null : <code aria-label={props.t('code')}>{item.code}</code>}
        </div>
      ))}
      {attempt?.prompt === undefined
        ? active ? <p role="status">{props.t('waiting')}</p> : null
        : (
          <div>
            <label>
              {attempt.prompt.message}
              {attempt.prompt.kind === 'select'
                ? (
                  <select value={answer} disabled={busy} onChange={(event) => { setAnswer(event.target.value) }}>
                    {attempt.prompt.options.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                )
                : (
                  <input
                    type={attempt.prompt.kind === 'secret' ? 'password' : 'text'}
                    value={answer}
                    placeholder={attempt.prompt.placeholder}
                    disabled={busy}
                    onChange={(event) => { setAnswer(event.target.value) }}
                  />
                )}
            </label>
            <button type="button" disabled={busy || answer.length === 0} onClick={() => { void respond() }}>
              {props.t('continue')}
            </button>
          </div>
        )}
      {!flow.configured && attempt === undefined
        ? flow.methods.map(method => (
          <button
            key={method.id}
            type="button"
            disabled={busy || flow.inFlight || !flow.writable}
            onClick={() => { void start(method.id) }}
          >
            {busy ? props.t('signingIn') : method.label}
          </button>
        ))
        : null}
      {active ? <button type="button" disabled={busy} onClick={() => { void cancel() }}>{props.t('cancel')}</button> : null}
      {flow.configured
        ? <button type="button" disabled={busy || !flow.writable} onClick={() => { void signOut() }}>
          {busy ? props.t('signingOut') : props.t('signOut')}
        </button>
        : null}
      {notice === undefined ? null : <p role="status">{notice}</p>}
      {failure === undefined ? null : <p role="alert">{failure}</p>}
    </div>
  )
}
