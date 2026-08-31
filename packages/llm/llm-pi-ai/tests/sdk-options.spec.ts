import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { StreamFunction } from '@earendil-works/pi-ai'

const stream = vi.hoisted(() => vi.fn<StreamFunction<'openai-responses'>>())
const streamSimple = vi.hoisted(() => vi.fn<StreamFunction<'openai-responses'>>())

// A hand-declared route is built by `createProvider` over the protocol table in
// `src/provider.ts`, so the table's lazy api module is the SDK boundary this
// test can observe. A catalog route dispatches through pi-ai's own provider and
// would not see this mock.
vi.mock('@earendil-works/pi-ai/api/openai-responses.lazy', () => ({
  openAIResponsesApi: () => ({ stream, streamSimple }),
}))

import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'

afterEach(() => {
  stream.mockReset()
  streamSimple.mockReset()
})

/** A hand-declared OpenAI-compatible route with one fully described model. */
function gatewayAdapter(serviceTier?: 'fast'): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles({
      'local-gateway': {
        api: 'openai-responses',
        baseURL: 'http://127.0.0.1:9/v1',
        models: [{ id: 'local-model', contextWindow: 8192, maxTokens: 1024 }],
        ...serviceTier === undefined ? {} : { serviceTier },
      },
    }),
    resolveApiKey: () => Promise.resolve('test-key'),
    auth: memoryAuth(),
  })
}

async function drain(adapter: PiAiAdapter): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream({
    provider: 'local-gateway',
    model: 'local-model',
    messages: [],
  })) chunks.push(chunk)
  return chunks
}

describe('pi-ai SDK retry boundary', () => {
  it('pins one SDK attempt even when the installed provider currently defaults to zero retries', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    const chunks = await drain(gatewayAdapter())

    expect(streamSimple).toHaveBeenCalledOnce()
    expect(streamSimple.mock.calls[0]?.[2]).toMatchObject({ maxRetries: 0, apiKey: 'test-key' })
    // pi-ai reports a setup failure as a terminal in-stream error rather than
    // throwing, which the converter turns into the harness error finish.
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'mock SDK boundary' } },
    })
  })

  it('dispatches a hand-declared route to the endpoint and model its configuration describes', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    await drain(gatewayAdapter())

    expect(streamSimple.mock.calls[0]?.[0]).toMatchObject({
      id: 'local-model',
      provider: 'local-gateway',
      api: 'openai-responses',
      baseUrl: 'http://127.0.0.1:9/v1',
      contextWindow: 8192,
      maxTokens: 1024,
    })
  })

  it('dispatches a configured Fast tier through the Responses API stream', async () => {
    stream.mockImplementation(() => { throw new Error('mock SDK boundary') })

    await drain(gatewayAdapter('fast'))

    expect(streamSimple).not.toHaveBeenCalled()
    expect(stream).toHaveBeenCalledOnce()
    expect(stream.mock.calls[0]?.[2]).toMatchObject({ serviceTier: 'fast', maxRetries: 0, apiKey: 'test-key' })
  })
})
