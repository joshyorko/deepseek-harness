import { randomBytes } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import {
  AuthorizationDeclinedError,
  type AuthorizationEntry,
  type AuthorizationInteraction,
  type AuthorizationNotice,
  type AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AuthorizationAttemptView,
  AuthorizationFlowView,
  AuthorizationNoticeView,
  AuthorizationPromptView,
  AuthorizationStartView,
} from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'authorization/invalid-method': {}
    'authorization/already-in-flight': {}
    'authorization/invalid-key': {}
    'authorization/unknown-key': {}
    'authorization/stale-attempt': {}
    'authorization/invalid-prompt': {}
    'authorization/invalid-response': {}
    'authorization/already-prompting': {}
  }
}

type AuthorizationRemoteErrorCode =
  | 'authorization/invalid-method'
  | 'authorization/already-in-flight'
  | 'authorization/invalid-key'
  | 'authorization/unknown-key'
  | 'authorization/stale-attempt'
  | 'authorization/invalid-prompt'
  | 'authorization/invalid-response'
  | 'authorization/already-prompting'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { authorizationController: AuthorizationController }
}

interface Attempt {
  readonly id: string
  readonly key: CredentialKey
  readonly controller: AbortController
  state: AuthorizationAttemptView['state']
  notices: AuthorizationNoticeView[]
  prompt: {
    readonly id: string
    readonly prompt: AuthorizationPrompt
    readonly resolve: (value: string) => void
    readonly reject: (error: unknown) => void
    readonly dispose: () => void
  } | undefined
  error: AuthorizationAttemptView['error']
}

const MAX_NOTICES = 32

function failure(code: AuthorizationRemoteErrorCode, message: string): RemoteError<AuthorizationRemoteErrorCode> {
  return new RemoteError(code, message, {})
}

/** Keep provider notices inside the deliberately small wire vocabulary. */
function copyNotice(notice: AuthorizationNotice): AuthorizationNoticeView {
  return {
    message: notice.message,
    ...notice.url === undefined ? {} : { url: notice.url },
    ...notice.code === undefined ? {} : { code: notice.code },
  }
}

function copyPrompt(id: string, prompt: AuthorizationPrompt): AuthorizationPromptView {
  if (prompt.kind === 'select') {
    return {
      id,
      kind: 'select',
      message: prompt.message,
      options: prompt.options.map(option => ({ ...option })),
    }
  }
  return {
    id,
    kind: prompt.kind,
    message: prompt.message,
    ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
  }
}

function copyStatus(attempt: Attempt): AuthorizationAttemptView {
  return {
    attemptId: attempt.id,
    key: attempt.key,
    state: attempt.state,
    notices: attempt.notices.map(notice => ({ ...notice })),
    ...attempt.prompt === undefined ? {} : { prompt: copyPrompt(attempt.prompt.id, attempt.prompt.prompt) },
    ...attempt.error === undefined ? {} : { error: { ...attempt.error } },
  }
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
      for (const attempt of this.attempts.values()) this.cancelAttempt(attempt)
      this.attempts.clear()
    }, 'llm-pi-ai-oauth.dispose')
  }

  /**
   * List registered provider authorization flows and current record state.
   * @returns the current flow views.
   */
  @Remote('list')
  async list(): Promise<readonly AuthorizationFlowView[]> {
    const flows = this.context.authorization.list()
    const keys = new Set(flows.map(flow => flow.key))
    for (const key of this.attempts.keys()) if (!keys.has(key)) this.attempts.delete(key)
    return Promise.all(flows.map(async (flow) => {
      const record = await this.context.credentials.describeRecord(flow.key)
      const attempt = this.attempts.get(flow.key)
      return {
        key: flow.key,
        label: flow.label,
        methods: flow.methods.map(method => ({ ...method })),
        inFlight: flow.inFlight || (attempt !== undefined && isActive(attempt)),
        configured: record.configured,
        writable: record.writable,
      }
    }))
  }

  /** Start one provider authorization attempt.
   * @param key - credential key of the registered flow.
   * @param method - provider authorization method to run.
   * @returns the newly started attempt and its initial status.
   * @throws {RemoteError} when the key or method is unavailable, or an attempt is active.
   */
  @Remote('start')
  start(key: string, method: string): AuthorizationStartView {
    const flow = this.flow(key)
    if (flow.methods.every(candidate => candidate.id !== method)) throw failure('authorization/invalid-method', `authorization method "${method}" is not available`)
    const previous = this.attempts.get(flow.key)
    if (previous !== undefined && isActive(previous)) throw failure('authorization/already-in-flight', 'an authorization attempt is already running')
    const controller = new AbortController()
    const attempt: Attempt = { id: randomBytes(18).toString('base64url'), key: flow.key, controller, state: 'running', notices: [], prompt: undefined, error: undefined }
    this.attempts.set(flow.key, attempt)
    void this.run(flow, attempt, method)
    return { attemptId: attempt.id, key: flow.key, status: copyStatus(attempt) }
  }

  /** Read the current state of one authorization attempt.
   * @param key - credential key of the registered flow.
   * @param attemptId - attempt identifier returned by {@link start}.
   * @returns the current attempt state.
   * @throws {RemoteError} when the key or attempt is stale.
   */
  @Remote('status')
  status(key: string, attemptId: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    return copyStatus(attempt)
  }

  /** Submit a response to the active authorization prompt.
   * @param key - credential key of the registered flow.
   * @param attemptId - active attempt identifier.
   * @param promptId - active prompt identifier.
   * @param value - selected or entered response.
   * @returns the updated attempt state.
   * @throws {RemoteError} when the attempt or response is invalid.
   */
  @Remote('respond')
  respond(key: string, attemptId: string, promptId: string, value: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    if (attempt.prompt === undefined || attempt.prompt.id !== promptId) throw failure('authorization/invalid-prompt', 'that prompt is no longer active')
    if (attempt.prompt.prompt.kind === 'select' && !attempt.prompt.prompt.options.some(option => option.id === value)) throw failure('authorization/invalid-response', 'choose one of the listed options')
    const prompt = attempt.prompt
    prompt.dispose()
    attempt.prompt = undefined
    attempt.state = 'running'
    prompt.resolve(value)
    return copyStatus(attempt)
  }

  /** Cancel one active authorization attempt.
   * @param key - credential key of the registered flow.
   * @param attemptId - active attempt identifier.
   * @returns the cancelled attempt state.
   * @throws {RemoteError} when the key or attempt is stale.
   */
  @Remote('cancel')
  cancel(key: string, attemptId: string): AuthorizationAttemptView {
    const attempt = this.attempt(key, attemptId)
    this.cancelAttempt(attempt)
    return copyStatus(attempt)
  }

  /** Delete the stored credential for a provider flow.
   * @param key - credential key of the registered flow.
   * @returns a promise that settles after the record is removed.
   * @throws {RemoteError} when the key is unavailable or record deletion fails.
   */
  @Remote('signOut')
  async signOut(key: string): Promise<void> {
    const flow = this.flow(key)
    const active = this.attempts.get(flow.key)
    if (active !== undefined && isActive(active)) this.cancelAttempt(active)
    await this.context.credentials.deleteRecord(flow.key)
  }

  private flow(value: string): AuthorizationEntry {
    let parsed: CredentialKey
    try { parsed = parseCredentialKey(value) } catch { throw failure('authorization/invalid-key', 'authorization key is invalid') }
    const flow = this.context.authorization.describe(parsed)
    if (flow === undefined) throw failure('authorization/unknown-key', 'that authorization flow is unavailable')
    return flow
  }

  private attempt(key: string, id: string): Attempt {
    let parsed: CredentialKey
    try { parsed = parseCredentialKey(key) } catch { throw failure('authorization/invalid-key', 'authorization key is invalid') }
    const attempt = this.attempts.get(parsed)
    if (attempt === undefined || attempt.id !== id) throw failure('authorization/stale-attempt', 'that authorization attempt is no longer active')
    return attempt
  }

  private async run(flow: AuthorizationEntry, attempt: Attempt, method: string): Promise<void> {
    const interaction: AuthorizationInteraction = {
      notify: (notice) => {
        if (!isCurrent(this.attempts, attempt) || !isActive(attempt)) return
        attempt.notices = [...attempt.notices, copyNotice(notice)].slice(-MAX_NOTICES)
      },
      prompt: prompt => new Promise<string>((resolve, reject) => {
        if (attempt.prompt !== undefined) { reject(failure('authorization/already-prompting', 'another prompt is already active')); return }
        const id = randomBytes(12).toString('base64url')
        const dispose = (): void => prompt.signal?.removeEventListener('abort', onAbort)
        const onAbort = (): void => {
          if (attempt.prompt?.id !== id) return
          attempt.prompt = undefined
          if (attempt.state === 'prompt') attempt.state = 'running'
          reject(new Error('prompt cancelled'))
        }
        prompt.signal?.addEventListener('abort', onAbort, { once: true })
        if (!isCurrent(this.attempts, attempt) || !isActive(attempt)) { reject(new Error('attempt ended')); return }
        attempt.state = 'prompt'
        attempt.prompt = { id, prompt, resolve, reject, dispose }
      }),
    }
    try {
      const outcome = await this.context.authorization.begin({
        key: flow.key,
        method,
        interaction,
        signal: attempt.controller.signal,
      })
      if (isCurrent(this.attempts, attempt) && isActive(attempt)) attempt.state = outcome.status
    } catch {
      if (isCurrent(this.attempts, attempt) && isActive(attempt)) {
        attempt.state = attempt.controller.signal.aborted ? 'cancelled' : 'failed'
        if (attempt.state === 'failed') attempt.error = { code: 'authorization-failed', message: 'Authorization failed. Try again.' }
      }
      if (attempt.prompt !== undefined) { attempt.prompt.dispose(); attempt.prompt.reject(new Error('attempt ended')); attempt.prompt = undefined }
    }
  }

  /** Cancel an owned attempt and immediately publish its terminal state. */
  private cancelAttempt(attempt: Attempt): void {
    if (!isActive(attempt)) return
    attempt.controller.abort()
    attempt.state = 'cancelled'
    if (attempt.prompt !== undefined) {
      const prompt = attempt.prompt
      prompt.dispose()
      attempt.prompt = undefined
      prompt.reject(new AuthorizationDeclinedError())
    }
    this.context.authorization.cancel(attempt.key)
  }
}

/** Whether an attempt can still receive notices or a prompt. */
function isActive(attempt: Attempt): boolean {
  return attempt.state === 'running' || attempt.state === 'prompt'
}

/** Completion from an older attempt must never mutate a replacement. */
function isCurrent(attempts: ReadonlyMap<CredentialKey, Attempt>, attempt: Attempt): boolean {
  return attempts.get(attempt.key) === attempt
}

export const apply = (ctx: Context): void => { new AuthorizationController(ctx) }
export const name = 'llm-pi-ai-oauth'
export default AuthorizationController
