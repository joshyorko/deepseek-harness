import { randomBytes } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import type { AuthorizationEntry, AuthorizationInteraction, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { AuthorizationAttemptView, AuthorizationFlowView, AuthorizationStartView } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { authorizationController: AuthorizationController }
}

interface Attempt {
  readonly id: string
  readonly key: CredentialKey
  readonly controller: AbortController
  state: AuthorizationAttemptView['state']
  notices: AuthorizationAttemptView['notices']
  prompt: { readonly id: string; readonly prompt: AuthorizationPrompt; readonly resolve: (value: string) => void; readonly reject: (error: unknown) => void; readonly dispose: () => void } | undefined
  error: AuthorizationAttemptView['error']
}

const MAX_NOTICES = 32

function failure(code: string, message: string): TypertRemoteFailure {
  return new TypertRemoteFailure({ code, message, details: {} })
}

function copyPrompt(prompt: AuthorizationPrompt): AuthorizationPrompt {
  if (prompt.kind === 'select') return { kind: 'select', message: prompt.message, options: prompt.options.map(option => ({ ...option })) }
  return { kind: prompt.kind, message: prompt.message, ...(prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder }) }
}

function copyStatus(attempt: Attempt): AuthorizationAttemptView {
  return { attemptId: attempt.id, key: attempt.key, state: attempt.state, notices: attempt.notices.map(notice => ({ ...notice })), ...(attempt.prompt === undefined ? {} : { prompt: { ...copyPrompt(attempt.prompt.prompt), id: attempt.prompt.id } }), ...(attempt.error === undefined ? {} : { error: { ...attempt.error } }) }
}

/** Optional self-hosted Remote owner for browser-driven authorization flows. */
export class AuthorizationController extends TypertRemoteService {
  static inject = ['authorization', 'credentials']
  private readonly context: Context
  private readonly attempts = new Map<CredentialKey, Attempt>()

  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
    this.context = ctx
    ctx.effect(() => () => {
      for (const attempt of this.attempts.values()) attempt.controller.abort()
      this.attempts.clear()
    }, 'llm-pi-ai-oauth.dispose')
  }

  @Remote('list')
  async list(): Promise<readonly AuthorizationFlowView[]> {
    const flows = this.context.authorization.list()
    const keys = new Set(flows.map(flow => flow.key))
    for (const key of this.attempts.keys()) if (!keys.has(key)) this.attempts.delete(key)
    return Promise.all(flows.map(async flow => {
      const record = await this.context.credentials.describeRecord(flow.key)
      return { key: flow.key, label: flow.label, methods: flow.methods.map(method => ({ ...method })), inFlight: this.attempts.has(flow.key), configured: record.configured, writable: record.writable }
    }))
  }

  @Remote('start')
  start(key: string, method: string): AuthorizationStartView {
    const flow = this.flow(key)
    if (flow.methods.every(candidate => candidate.id !== method)) throw failure('invalid-method', `authorization method "${method}" is not available`)
    if (this.attempts.has(flow.key)) throw failure('already-in-flight', 'an authorization attempt is already running')
    const controller = new AbortController()
    const attempt: Attempt = { id: randomBytes(18).toString('base64url'), key: flow.key, controller, state: 'running', notices: [], prompt: undefined, error: undefined }
    this.attempts.set(flow.key, attempt)
    void this.run(flow, attempt, method)
    return { attemptId: attempt.id, key: flow.key, status: copyStatus(attempt) }
  }

  @Remote('status')
  status(key: string, attemptId: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    return copyStatus(attempt)
  }

  @Remote('respond')
  respond(key: string, attemptId: string, promptId: string, value: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    if (attempt.prompt === undefined || attempt.prompt.id !== promptId) throw failure('invalid-prompt', 'that prompt is no longer active')
    if (attempt.prompt.prompt.kind === 'select' && !attempt.prompt.prompt.options.some(option => option.id === value)) throw failure('invalid-response', 'choose one of the listed options')
    const prompt = attempt.prompt
    prompt.dispose()
    prompt.resolve(value)
    attempt.prompt = undefined
    return copyStatus(attempt)
  }

  @Remote('cancel')
  cancel(key: string, attemptId: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    attempt.controller.abort()
    attempt.state = 'cancelled'
    if (attempt.prompt !== undefined) { attempt.prompt.dispose(); attempt.prompt.reject(new Error('attempt cancelled')); attempt.prompt = undefined }
    this.context.authorization.cancel(attempt.key)
    return copyStatus(attempt)
  }

  @Remote('signOut')
  async signOut(key: string): Promise<void> {
    const flow = this.flow(key)
    const active = this.attempts.get(flow.key)
    if (active !== undefined && active.state === 'running') { active.controller.abort(); active.state = 'cancelled'; this.context.authorization.cancel(active.key) }
    await this.context.credentials.deleteRecord(flow.key)
  }

  private flow(value: string): AuthorizationEntry {
    let parsed: CredentialKey
    try { parsed = parseCredentialKey(value) } catch { throw failure('invalid-key', 'authorization key is invalid') }
    const flow = this.context.authorization.describe(parsed)
    if (flow === undefined) throw failure('unknown-key', `no authorization flow is registered for "${value}"`)
    return flow
  }

  private attempt(key: string, id: string): Attempt {
    let parsed: CredentialKey
    try { parsed = parseCredentialKey(key) } catch { throw failure('invalid-key', 'authorization key is invalid') }
    const attempt = this.attempts.get(parsed)
    if (attempt === undefined || attempt.id !== id) throw failure('stale-attempt', 'that authorization attempt is no longer active')
    return attempt
  }

  private async run(flow: AuthorizationEntry, attempt: Attempt, method: string): Promise<void> {
    const interaction: AuthorizationInteraction = {
      notify: notice => {
        if (attempt.state !== 'running') return
        attempt.notices = [...attempt.notices, { ...notice }].slice(-MAX_NOTICES)
      },
      prompt: prompt => new Promise<string>((resolve, reject) => {
        if (attempt.prompt !== undefined) { reject(failure('already-prompting', 'another prompt is already active')); return }
        const id = randomBytes(12).toString('base64url')
        const dispose = (): void => prompt.signal?.removeEventListener('abort', onAbort)
        const onAbort = (): void => { attempt.prompt = undefined; reject(new Error('prompt cancelled')) }
        prompt.signal?.addEventListener('abort', onAbort, { once: true })
        attempt.state = 'prompt'
        attempt.prompt = { id, prompt: copyPrompt(prompt), resolve, reject, dispose }
      }),
    }
    try {
      await this.context.authorization.begin({ key: flow.key, method, interaction, signal: attempt.controller.signal })
      if (attempt.state === 'running' || attempt.state === 'prompt') attempt.state = 'authorized'
    } catch {
      if (attempt.state === 'running' || attempt.state === 'prompt') attempt.state = attempt.controller.signal.aborted ? 'cancelled' : 'failed'
      if (attempt.state === 'failed') attempt.error = { code: 'authorization-failed', message: 'authorization failed; try again' }
      if (attempt.prompt !== undefined) { attempt.prompt.dispose(); attempt.prompt.reject(new Error('attempt ended')); attempt.prompt = undefined }
    }
  }
}

export const apply = (ctx: Context): void => { new AuthorizationController(ctx) }
export const name = 'llm-pi-ai-oauth'
export default AuthorizationController
