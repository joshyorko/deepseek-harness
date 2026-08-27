/** Authorization-domain wire contract for provider-native sign-in. */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One sign-in method offered by a credential-owning provider. */
export interface AuthorizationMethodView {
  id: string
  label: string
}

/** Value-free state of one provider-native authorization flow. */
export interface AuthorizationEntryView {
  key: string
  label: string
  methods: AuthorizationMethodView[]
  inFlight: boolean
  configured: boolean
  writable: boolean
  credentialKind?: 'api-key' | 'grant'
}

/** One progress message emitted by the provider's sign-in flow. */
export interface AuthorizationNoticeView {
  message: string
  url?: string
  code?: string
}

/** One browser-answerable prompt emitted by the provider's sign-in flow. */
export type AuthorizationPromptView = {
  id: string
  message: string
  placeholder?: string
} & (
  | { kind: 'text' | 'secret' }
  | { kind: 'select'; options: { id: string; label: string; description?: string }[] }
)

/** Current state of one bounded provider-native authorization attempt. */
export interface AuthorizationAttemptView {
  attemptId: string
  key: string
  state: 'running' | 'prompt' | 'authorized' | 'cancelled' | 'failed'
  notices: AuthorizationNoticeView[]
  prompt?: AuthorizationPromptView
  error?: string
}

/** Authorization-domain unary methods. */
export interface AuthorizationApi {
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ entries: AuthorizationEntryView[] }>>
  start(request: RpcRequest<{ key: string; method?: string }>): Promise<RpcResponse<{ attempt: AuthorizationAttemptView }>>
  status(request: RpcRequest<{ key: string; attemptId: string }>): Promise<RpcResponse<{ attempt: AuthorizationAttemptView }>>
  respond(request: RpcRequest<{
    key: string
    attemptId: string
    promptId: string
    value: string
  }>): Promise<RpcResponse<{}>>
  cancel(request: RpcRequest<{ key: string; attemptId: string }>): Promise<RpcResponse<{}>>
  signOut(request: RpcRequest<{ key: string }>): Promise<RpcResponse<{}>>
}
