import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { credentialKey, CredentialProvider } from '@deepseek-ai/dsh-credentials'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry,
  CredentialRecordInfo, CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import type { RpcRequest, RpcResponse } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

const DEFAULTS = { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }
const CODEX_KEY = credentialKey('llm-pi-ai', 'openai-codex')

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`authorization-${String(nextRpc++)}`), payload }
}

function expectOk<T>(response: RpcResponse<T>): T {
  expect(response.result.ok).toBe(true)
  if (!response.result.ok) throw new Error('unreachable')
  return response.result.value
}

class MemoryCredentials extends CredentialProvider {
  readonly records = new Map<CredentialKey, CredentialRecord>()

  override resolve(_ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    return Promise.resolve(undefined)
  }

  override describe(_ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: false, writable: true })
  }

  override set(_ref: CredentialRef, _value: string): Promise<void> {
    return Promise.resolve()
  }

  override unset(_ref: CredentialRef): Promise<void> {
    return Promise.resolve()
  }

  override readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  override describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const record = this.records.get(key)
    return Promise.resolve(record === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: record.kind, writable: true })
  }

  override listRecords(): Promise<readonly CredentialRecordEntry[]> {
    return Promise.resolve([...this.records].map(([key, record]) => ({ key, kind: record.kind })))
  }

  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(key))
    if (next === undefined) return this.records.get(key)
    this.records.set(key, next)
    this.ctx.emit('credentials/record-updated', key)
    return next
  }

  override deleteRecord(key: CredentialKey): Promise<void> {
    if (this.records.delete(key)) this.ctx.emit('credentials/record-updated', key)
    return Promise.resolve()
  }
}

async function harness(): Promise<{
  ctx: Context
  credentials: MemoryCredentials
  api: ReturnType<typeof createApiProxy>
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  const credentials = ctx.credentials as MemoryCredentials
  ctx.authorization.registerFlow({
    key: CODEX_KEY,
    label: 'ChatGPT (Codex)',
    methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
    async run(session) {
      session.notify({
        message: 'Open this page to continue signing in.',
        url: 'https://auth.openai.com/codex/device',
        code: 'ABCD-1234',
      })
      const account = await session.prompt({
        kind: 'select',
        message: 'Choose an account',
        options: [
          { id: 'personal', label: 'Personal' },
          { id: 'work', label: 'Work', description: 'Managed workspace' },
        ],
      })
      await credentials.modifyRecord(CODEX_KEY, () => Promise.resolve({
        kind: 'grant', payload: { type: 'oauth', account },
      }))
    },
  })
  return { ctx, credentials, api: createApiProxy(ctx, DEFAULTS) }
}

describe('authorization domain', () => {
  it('lists provider-native sign-in methods with value-free credential state', async () => {
    const { api } = await harness()

    expect(expectOk(await api.authorization.list(request({})))).toEqual({
      entries: [{
        key: 'llm-pi-ai/openai-codex',
        label: 'ChatGPT (Codex)',
        methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
        inFlight: false,
        configured: false,
        writable: true,
      }],
    })
  })

  it('carries notices and prompts through a successful authorization attempt', async () => {
    const { api, credentials } = await harness()
    const started = expectOk(await api.authorization.start(request({
      key: 'llm-pi-ai/openai-codex', method: 'oauth',
    })))
    expect(started.attempt.attemptId).toBeTypeOf('string')

    await vi.waitFor(async () => {
      const status = expectOk(await api.authorization.status(request({
        key: 'llm-pi-ai/openai-codex', attemptId: started.attempt.attemptId,
      })))
      expect(status.attempt).toMatchObject({
        state: 'prompt',
        notices: [{
          message: 'Open this page to continue signing in.',
          url: 'https://auth.openai.com/codex/device',
          code: 'ABCD-1234',
        }],
        prompt: {
          kind: 'select',
          message: 'Choose an account',
          options: [
            { id: 'personal', label: 'Personal' },
            { id: 'work', label: 'Work', description: 'Managed workspace' },
          ],
        },
      })
      const promptId = status.attempt?.prompt?.id
      expect(promptId).toBeTypeOf('string')
      expectOk(await api.authorization.respond(request({
        key: 'llm-pi-ai/openai-codex',
        attemptId: started.attempt.attemptId,
        promptId: promptId as string,
        value: 'personal',
      })))
    })

    await vi.waitFor(async () => {
      const status = expectOk(await api.authorization.status(request({
        key: 'llm-pi-ai/openai-codex', attemptId: started.attempt.attemptId,
      })))
      expect(status.attempt?.state).toBe('authorized')
    })
    expect(credentials.records.get(CODEX_KEY)).toEqual({
      kind: 'grant', payload: { type: 'oauth', account: 'personal' },
    })
    expect(expectOk(await api.authorization.list(request({}))).entries[0]).toMatchObject({
      configured: true, credentialKind: 'grant', inFlight: false,
    })
  })

  it('cancels a pending prompt and forgets a stored grant on sign-out', async () => {
    const { api, credentials } = await harness()
    const started = expectOk(await api.authorization.start(request({
      key: 'llm-pi-ai/openai-codex', method: 'oauth',
    })))
    await vi.waitFor(async () => {
      const status = expectOk(await api.authorization.status(request({
        key: 'llm-pi-ai/openai-codex', attemptId: started.attempt.attemptId,
      })))
      expect(status.attempt?.state).toBe('prompt')
    })

    expectOk(await api.authorization.cancel(request({
      key: 'llm-pi-ai/openai-codex', attemptId: started.attempt.attemptId,
    })))
    await vi.waitFor(async () => {
      const status = expectOk(await api.authorization.status(request({
        key: 'llm-pi-ai/openai-codex', attemptId: started.attempt.attemptId,
      })))
      expect(status.attempt?.state).toBe('cancelled')
    })

    credentials.records.set(CODEX_KEY, { kind: 'grant', payload: { type: 'oauth' } })
    expectOk(await api.authorization.signOut(request({ key: 'llm-pi-ai/openai-codex' })))
    expect(credentials.records.has(CODEX_KEY)).toBe(false)
  })
})
