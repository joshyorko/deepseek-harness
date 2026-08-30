import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClientAuthorizationRemote, ClientSettingsRemote } from './remote.ts'
import type { AuthorizationAttemptView, AuthorizationFlowView } from '../types.ts'

interface ProviderCardExtrasOwnerProps { readonly provider: { readonly provider: string; readonly settingsNs: string; readonly settingsPath: readonly string[] }; readonly keyConfigured: boolean }

export interface AuthorizationCardProps extends ProviderCardExtrasOwnerProps {
  remote: ClientAuthorizationRemote
  settings: ClientSettingsRemote
}

/** Small provider-card extension; all copy from the flow is wire-owned. */
export function AuthorizationCard(props: AuthorizationCardProps): ReactNode {
  const [flow, setFlow] = useState<AuthorizationFlowView | undefined>()
  const [attempt, setAttempt] = useState<AuthorizationAttemptView & { id?: string }>()
  const [value, setValue] = useState('')
  useEffect(() => { let live = true; void props.remote.list().then(rows => { if (live) setFlow(rows.find(row => row.key === `${props.provider.settingsNs}/${props.provider.provider}`)) }); return () => { live = false } }, [props.remote, props.provider.provider, props.provider.settingsNs])
  useEffect(() => {
    if (attempt?.id === undefined) return
    const timer = window.setInterval(() => { void props.remote.status(flow!.key, attempt.id!).then(setAttempt) }, 750)
    return () => window.clearInterval(timer)
  }, [attempt?.id, flow, props.remote])
  if (props.keyConfigured || flow === undefined) return null
  const start = async (): Promise<void> => { const method = flow.methods[0]; if (method === undefined) return; const started = await props.remote.start(flow.key, method.id); setAttempt({ ...started.status, id: started.attemptId }) }
  const respond = async (): Promise<void> => { if (attempt?.id === undefined || attempt.prompt === undefined || attempt.promptId === undefined) return; setAttempt({ ...(await props.remote.respond(flow.key, attempt.id, attempt.promptId, value)), id: attempt.id }); setValue('') }
  const finish = async (): Promise<void> => { if (attempt?.state !== 'authorized') return; const description = await props.settings.describe(); const current = description.namespaces.find(row => row.ns === props.provider.settingsNs); if (current !== undefined) await props.settings.mutate(current.ns, [{ op: 'set', path: [...props.provider.settingsPath], value: {} }], current.revision) }
  return <div role="group" aria-label={flow.label}>
    <span>{flow.label}</span>
    {attempt === undefined ? <button type="button" onClick={() => { void start() }}>Sign in</button> : <>
      {attempt.notices.map((notice, index) => <p key={`${notice.message}-${index}`}>{notice.message}{notice.url === undefined ? null : <a href={notice.url}>Open</a>}{notice.code === undefined ? null : <code>{notice.code}</code>}</p>)}
      {attempt.prompt === undefined ? null : <>{attempt.prompt.kind === 'select' ? <select value={value} onChange={event => { setValue(event.target.value) }}><option value="">Select</option>{attempt.prompt.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : <label>{attempt.prompt.message}<input type={attempt.prompt.kind === 'secret' ? 'password' : 'text'} value={value} onChange={event => { setValue(event.target.value) }} /></label>}<button type="button" onClick={() => { void respond() }}>Continue</button></>}
      {attempt.state === 'running' ? <button type="button" onClick={() => { if (attempt.id !== undefined) void props.remote.cancel(flow.key, attempt.id) }}>Cancel</button> : null}
      {attempt.error === undefined ? null : <p>{attempt.error.message}</p>}
      {attempt.state === 'authorized' ? <><button type="button" onClick={() => { void finish() }}>Save</button><button type="button" onClick={() => { void props.remote.signOut(flow.key) }}>Sign out</button></> : null}
    </>}
  </div>
}
