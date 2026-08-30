import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { credentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { AuthorizationController } from '../src/index.ts'

class MemoryCredentials extends CredentialProvider {
  readonly records = new Map<CredentialKey, CredentialRecord>()
  resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> { return Promise.resolve(undefined) }
  describe(_ref: CredentialRef): Promise<CredentialInfo> { return Promise.resolve({ configured: false, writable: true }) }
  set(_ref: CredentialRef, _value: string): Promise<void> { return Promise.resolve() }
  unset(_ref: CredentialRef): Promise<void> { return Promise.resolve() }
  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> { return Promise.resolve(this.records.get(key)) }
  describeRecord(key: CredentialKey): Promise<{ configured: boolean; kind?: CredentialRecord['kind']; writable: boolean }> {
    const record = this.records.get(key)
    return Promise.resolve(record === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: record.kind, writable: true })
  }
  listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records].map(([key, value]) => ({ key, kind: value.kind })))
  }
  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(key))
    if (next !== undefined) {
      this.records.set(key, next)
      this.ctx.emit('credentials/record-updated', key)
    }
    return next
  }
  deleteRecord(key: CredentialKey): Promise<void> {
    if (this.records.delete(key)) this.ctx.emit('credentials/record-updated', key)
    return Promise.resolve()
  }
}

const KEY = credentialKey('llm-pi-ai', 'openai-codex')
const OTHER = credentialKey('llm-pi-ai', 'anthropic')
const contexts: Context[] = []

async function harness(): Promise<{ ctx: Context; controller: AuthorizationController; credentials: MemoryCredentials }> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  const controller = new AuthorizationController(ctx)
  const credentials = ctx.credentials as MemoryCredentials
  contexts.push(ctx)
  return { ctx, controller, credentials }
}

async function settle(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

describe('AuthorizationController', () => {
  it('lists configured and writable flows without exposing records', async () => {
    const { ctx, controller, credentials } = await harness()
    await credentials.modifyRecord(OTHER, async () => ({ kind: 'grant', payload: { token: 'not-for-wire' } }))
    ctx.authorization.registerFlow({ key: OTHER, label: 'Other', methods: [{ id: 'oauth', label: 'Sign in' }], run: async () => {} })
    const rows = await controller.list()
    expect(rows).toEqual([{ key: OTHER, label: 'Other', methods: [{ id: 'oauth', label: 'Sign in' }], inFlight: false, configured: true, writable: true }])
    expect(JSON.stringify(rows)).not.toContain('not-for-wire')
  })

  it('rejects invalid, stale, and single-flight requests while retaining terminal state for replacement', async () => {
    const { controller, ctx, credentials } = await harness()
    const held = Promise.withResolvers<undefined>()
    ctx.authorization.registerFlow({ key: KEY, label: 'Codex', methods: [{ id: 'oauth', label: 'Sign in' }], run: async (session) => {
      await held.promise
      if (session.signal.aborted) return
      await credentials.modifyRecord(KEY, async () => ({ kind: 'grant', payload: { ok: true } }))
    } })
    expect(() => controller.start('bad', 'oauth')).toThrow('authorization key is invalid')
    const started = controller.start(KEY, 'oauth')
    expect(() => controller.start(KEY, 'oauth')).toThrow('an authorization attempt is already running')
    controller.cancel(KEY, started.attemptId)
    expect(controller.status(KEY, started.attemptId).state).toBe('cancelled')
    expect(() => controller.status(KEY, 'stale')).toThrow('that authorization attempt is no longer active')
    held.resolve(undefined)
    await settle()
    const replacement = controller.start(KEY, 'oauth')
    expect(replacement.attemptId).not.toBe(started.attemptId)
  })

  it('relays notices and text, secret, and select prompts with validation', async () => {
    const { controller, ctx, credentials } = await harness()
    let answer: string | undefined
    ctx.authorization.registerFlow({ key: KEY, label: 'Codex', methods: [{ id: 'oauth', label: 'Sign in' }], run: async (session) => {
      session.notify({ message: 'Open the page', url: 'https://auth.example', code: 'ABC' })
      answer = await session.prompt({ kind: 'select', message: 'Choose account', options: [{ id: 'one', label: 'One', description: 'First' }] })
      await credentials.modifyRecord(KEY, async () => ({ kind: 'grant', payload: { ok: true } }))
    } })
    const started = controller.start(KEY, 'oauth')
    await settle()
    const status = controller.status(KEY, started.attemptId)
    expect(status.state).toBe('prompt')
    const prompt = status.prompt
    expect(prompt).toEqual({ id: expect.any(String), kind: 'select', message: 'Choose account', options: [{ id: 'one', label: 'One', description: 'First' }] })
    expect(() => controller.respond(KEY, started.attemptId, prompt!.id, 'wrong')).toThrow('choose one of the listed options')
    controller.respond(KEY, started.attemptId, prompt!.id, 'one')
    await settle()
    expect(answer).toBe('one')
    expect(controller.status(KEY, started.attemptId).state).toBe('authorized')
    expect(JSON.stringify(controller.status(KEY, started.attemptId))).not.toContain('ok')
  })

  it('reports a safe generic failure, cancels prompt state, and signs out', async () => {
    const { controller, ctx } = await harness()
    ctx.authorization.registerFlow({ key: KEY, label: 'Codex', methods: [{ id: 'oauth', label: 'Sign in' }], run: async (session) => {
      await session.prompt({ kind: 'secret', message: 'Password', placeholder: 'hidden' })
      throw new Error('provider token must never cross wire')
    } })
    const started = controller.start(KEY, 'oauth')
    await settle()
    const prompted = controller.status(KEY, started.attemptId)
    expect(prompted.state).toBe('prompt')
    expect(prompted.prompt?.kind).toBe('secret')
    await controller.signOut(KEY)
    expect(controller.status(KEY, started.attemptId).state).toBe('cancelled')
    await settle()
    expect(JSON.stringify(controller.status(KEY, started.attemptId))).not.toContain('provider token')
  })
})
