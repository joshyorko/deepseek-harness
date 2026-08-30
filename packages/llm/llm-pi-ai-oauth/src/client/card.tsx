import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClientAuthorizationRemote, ClientSettingsRemote } from './remote.ts'
import type { AuthorizationAttemptView, AuthorizationFlowView } from '../types.ts'
import { en } from './locales.ts'

interface ProviderCardExtrasOwnerProps { readonly provider: { readonly provider: string; readonly settingsNs: string; readonly settingsPath: readonly string[] }; readonly keyConfigured: boolean }

export interface AuthorizationCardProps extends ProviderCardExtrasOwnerProps {
  remote: ClientAuthorizationRemote
  settings: ClientSettingsRemote
}

/** Small provider-card extension; all copy from the flow is wire-owned. */
export function AuthorizationCard(props: AuthorizationCardProps): ReactNode {
  const [flow, setFlow] = useState<AuthorizationFlowView | undefined>()
  const [attempt, setAttempt] = useState<AuthorizationAttemptView | undefined>()
  const [error, setError] = useState<string>()
  const [value, setValue] = useState('')
  useEffect(() => { let live = true; void props.remote.list().then(rows => { if (live) setFlow(rows.find(row => row.key === `${props.provider.settingsNs}/${props.provider.provider}`)) }); return () => { live = false } }, [props.remote, props.provider.provider, props.provider.settingsNs])
  useEffect(() => {
    if (attempt === undefined || flow === undefined || attempt.state !== 'running' && attempt.state !== 'prompt') return
    const timer = window.setInterval(() => { void props.remote.status(flow.key, attempt.attemptId).then(setAttempt).catch(() => {}) }, 750)
    return () => window.clearInterval(timer)
  }, [attempt, flow, props.remote])
  if (props.keyConfigured || flow === undefined) return null
  const start = async (): Promise<void> => { const method = flow.methods[0]; if (method === undefined) return; try { setError(undefined); setAttempt((await props.remote.start(flow.key, method.id)).status) } catch { setError(en.startFailed) } }
  const respond = async (): Promise<void> => { if (attempt === undefined || attempt.prompt === undefined) return; try { setAttempt(await props.remote.respond(flow.key, attempt.attemptId, attempt.prompt.id, value)); setValue('') } catch { setError(en.responseFailed) } }
  const cancel = async (): Promise<void> => { if (attempt === undefined) return; try { setAttempt(await props.remote.cancel(flow.key, attempt.attemptId)) } catch { setError(en.cancelFailed) } }
  const finish = async (): Promise<void> => { if (attempt?.state !== 'authorized') return; try { const description = await props.settings.describe(); const current = description.namespaces.find(row => row.ns === props.provider.settingsNs); if (current !== undefined) await props.settings.mutate(current.ns, [{ op: 'set', path: [...props.provider.settingsPath], value: {} }], current.revision) } catch { setError(en.profileFailed) } }
  return <div role="group" aria-label={flow.label}>
    <span>{flow.label}</span>
    {error === undefined ? null : <p role="alert">{error}</p>}
    {attempt === undefined ? <button type="button" onClick={() => { void start() }}>{en.signIn}</button> : <>
      {attempt.notices.map((notice, index) => <p key={`${notice.message}-${index}`}>{notice.message}{notice.url === undefined ? null : <a href={notice.url}>Open</a>}{notice.code === undefined ? null : <code>{notice.code}</code>}</p>)}
      {attempt.prompt === undefined ? null : <>{attempt.prompt.kind === 'select' ? <><label>{attempt.prompt.message}</label><select value={value} onChange={event => { setValue(event.target.value) }}><option value="">{en.select}</option>{attempt.prompt.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></> : <label>{attempt.prompt.message}<input type={attempt.prompt.kind === 'secret' ? 'password' : 'text'} value={value} placeholder={attempt.prompt.placeholder} onChange={event => { setValue(event.target.value) }} /></label>}<button type="button" onClick={() => { void respond() }}>{en.continue}</button></>}
      {attempt.state === 'running' || attempt.state === 'prompt' ? <button type="button" onClick={() => { void cancel() }}>{en.cancel}</button> : null}
      {attempt.state === 'authorized' ? <><button type="button" onClick={() => { void finish() }}>{en.finish}</button><button type="button" onClick={() => { void props.remote.signOut(flow.key).then(() => { setAttempt(undefined) }).catch(() => { setError(en.signOutFailed) }) }}>{en.signOut}</button></> : null}
    </>}
  </div>
}
